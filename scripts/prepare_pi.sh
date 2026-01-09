#!/bin/bash

# Qoom Kit - Raspberry Pi Preparation Script
# This script prepares an SD card with Raspberry Pi OS configured for Qoom
#
# SUPPORTED PLATFORMS:
#   - Linux (full support)
#   - macOS (requires ext4fuse for full support, basic support without it)
#   - Windows (via WSL - Windows Subsystem for Linux)
#
# IMAGE: Raspberry Pi OS (64-bit) with Desktop - based on Debian Trixie
#
# SUPPORTED MODELS:
#   - Raspberry Pi 5 (all variants)
#   - Raspberry Pi 4 (all variants)
#   - Raspberry Pi 3 (64-bit capable models)
#   - Any Pi that supports arm64 and Raspberry Pi OS Trixie/Bookworm
#
# USAGE:
#   sudo ./prepare_pi.sh
#
# macOS REQUIREMENTS (for full support):
#   brew install macfuse
#   brew install ext4fuse
#
# WINDOWS REQUIREMENTS:
#   WSL (Windows Subsystem for Linux) must be installed
#   Install WSL: wsl --install
#   For USB device access in WSL2: install usbipd-win
#
# This script will:
#   1. Detect and verify SD card
#   2. Clean format the SD card
#   3. Download Raspberry Pi OS (if not cached)
#   4. Image the SD card
#   5. Configure WiFi
#   6. Create username and secure password
#   7. Enable SSH
#   8. Create first-boot setup script
#   9. Bundle Qoom application code
#
# After first boot, the Pi will automatically:
#   - Install all dependencies (Node.js, PM2, etc.)
#   - Set up the Qoom application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ===================================
# OS Detection and Platform-Specific Functions
# ===================================
OS_TYPE="unknown"
IS_WSL=false

if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="mac"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Check for WSL (Windows Subsystem for Linux)
    if grep -qEi "(Microsoft|WSL)" /proc/version 2>/dev/null; then
        IS_WSL=true
        OS_TYPE="wsl"
    else
        OS_TYPE="linux"
    fi
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    echo -e "${RED}Error: Native Windows shells (Git Bash, Cygwin, MSYS) are not fully supported.${NC}"
    echo "Please use Windows Subsystem for Linux (WSL) instead."
    echo "Install WSL: wsl --install"
    exit 1
else
    echo -e "${RED}Error: Unsupported operating system: $OSTYPE${NC}"
    echo "This script supports macOS, Linux, and Windows (via WSL) only."
    exit 1
fi

echo -e "${BLUE}Detected OS: ${OS_TYPE}${NC}"
if [ "$IS_WSL" = true ]; then
    echo -e "${YELLOW}Running in Windows Subsystem for Linux (WSL)${NC}"
    echo -e "${YELLOW}Note: USB device access may require usbipd-win for WSL2${NC}"
    echo ""
fi

# Platform-specific function: List block devices
list_block_devices() {
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Available disks:"
        echo ""
        diskutil list | grep -E "^/dev/disk|external|internal" | head -20
    elif [ "$OS_TYPE" = "wsl" ]; then
        echo "Available block devices (via WSL):"
        echo ""
        echo -e "${YELLOW}Note: In WSL, physical drives appear as /dev/sdX${NC}"
        echo -e "${YELLOW}For WSL2, USB devices may need to be attached via usbipd${NC}"
        echo ""
        lsblk -d -o NAME,SIZE,TYPE,MODEL,TRAN 2>/dev/null | grep -v "loop" | grep -v "^NAME" || \
        ls -la /dev/sd* 2>/dev/null | grep -E "sd[a-z]$" || \
        echo "No block devices found. You may need to attach USB device via usbipd."
    else
        echo "Available block devices:"
        echo ""
        lsblk -d -o NAME,SIZE,TYPE,MODEL,TRAN | grep -v "loop" | grep -v "^NAME"
    fi
}

# Platform-specific function: Detect potential SD cards
detect_sd_cards() {
    if [ "$OS_TYPE" = "mac" ]; then
        # On Mac, look for external disks
        diskutil list external | grep -oE "/dev/disk[0-9]+" | sed 's|/dev/||' | sort -u || true
    elif [ "$OS_TYPE" = "wsl" ]; then
        # In WSL, look for removable block devices or attached USB devices
        lsblk -d -n -o NAME,RM 2>/dev/null | awk '$2=="1" {print $1}' || \
        lsblk -d -n -o NAME,TRAN 2>/dev/null | grep -E "usb|mmc" | awk '{print $1}' || true
    else
        # On Linux, look for USB or MMC devices
        lsblk -d -n -o NAME,TRAN | grep -E "usb|mmc" | awk '{print $1}' || true
    fi
}

# Platform-specific function: Get device size
get_device_size() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil info "/dev/$device" 2>/dev/null | grep "Disk Size" | awk -F: '{print $2}' | awk '{print $1, $2}' | xargs || echo "Unknown"
    else
        # Works for both Linux and WSL
        lsblk -d -n -o SIZE "/dev/$device" 2>/dev/null || echo "Unknown"
    fi
}

# Platform-specific function: Get device model
get_device_model() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil info "/dev/$device" 2>/dev/null | grep "Device / Media Name" | awk -F: '{print $2}' | xargs || echo "Unknown"
    else
        # Works for both Linux and WSL
        lsblk -d -n -o MODEL "/dev/$device" 2>/dev/null || echo "Unknown"
    fi
}

# Platform-specific function: Check if device exists
device_exists() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil info "/dev/$device" &>/dev/null
    else
        [ -b "/dev/$device" ]
    fi
}

# Platform-specific function: Unmount all partitions on a device
unmount_device() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Unmounting all volumes on /dev/$device..."
        diskutil unmountDisk "/dev/$device" 2>/dev/null || true
    else
        echo "Unmounting any mounted partitions..."
        for partition in /dev/${device}*; do
            if mount | grep -q "$partition"; then
                umount "$partition" 2>/dev/null || true
            fi
        done
        # For mmcblk devices
        if [[ "$device" == mmcblk* ]]; then
            for partition in /dev/${device}p*; do
                if mount | grep -q "$partition"; then
                    umount "$partition" 2>/dev/null || true
                fi
            done
        fi
    fi
}

# Platform-specific function: Wipe disk
wipe_disk() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Erasing disk /dev/$device..."
        # Use diskutil to erase - this also handles unmounting
        diskutil eraseDisk FAT32 TEMP_DISK MBRFormat "/dev/$device" || {
            echo -e "${YELLOW}Warning: diskutil erase failed, trying dd...${NC}"
            # Fallback: write zeros to first 100MB to clear partition table
            dd if=/dev/zero of="/dev/$device" bs=1m count=100 2>/dev/null || true
        }
    else
        echo "Wiping partition table..."
        wipefs -a "/dev/$device"
    fi
}

# Platform-specific function: Write image to disk
write_image() {
    local image_path="$1"
    local device="$2"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Writing image to /dev/r${device} (raw device for speed)..."
        # Use raw device (rdisk) for faster writes on Mac
        dd if="$image_path" of="/dev/r${device}" bs=4m status=progress conv=sync
    else
        dd if="$image_path" of="/dev/$device" bs=4M status=progress conv=fsync
    fi
}

# Platform-specific function: Refresh partition table
refresh_partitions() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Refreshing disk..."
        diskutil unmountDisk "/dev/$device" 2>/dev/null || true
        sleep 2
        # Mac auto-detects partition changes
    else
        echo "Re-reading partition table..."
        blockdev --rereadpt "/dev/$device" 2>/dev/null || true
        partprobe "/dev/$device" 2>/dev/null || true
        hdparm -z "/dev/$device" 2>/dev/null || true
        udevadm settle --timeout=10 2>/dev/null || sleep 3
    fi
}

# Platform-specific function: Get partition device name
get_partition_name() {
    local device="$1"
    local partition_num="$2"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "/dev/${device}s${partition_num}"
    elif [[ "$device" == mmcblk* ]] || [[ "$device" == nvme* ]]; then
        echo "/dev/${device}p${partition_num}"
    else
        echo "/dev/${device}${partition_num}"
    fi
}

# Platform-specific function: Wait for partition to appear
wait_for_partition() {
    local partition="$1"
    local max_wait="${2:-30}"
    local wait_count=0
    
    echo "Waiting for partition $partition to appear..."
    
    if [ "$OS_TYPE" = "mac" ]; then
        while [ ! -e "$partition" ] && [ $wait_count -lt $max_wait ]; do
            sleep 1
            wait_count=$((wait_count + 1))
            if [ $((wait_count % 5)) -eq 0 ]; then
                echo "  Still waiting... ($wait_count/$max_wait seconds)"
            fi
        done
    else
        while [ ! -b "$partition" ] && [ $wait_count -lt $max_wait ]; do
            sleep 1
            wait_count=$((wait_count + 1))
            if [ $((wait_count % 5)) -eq 0 ]; then
                echo "  Still waiting... ($wait_count/$max_wait seconds)"
                partprobe "/dev/$SD_DEVICE" 2>/dev/null || true
            fi
        done
    fi
    
    if [ "$OS_TYPE" = "mac" ]; then
        [ -e "$partition" ]
    else
        [ -b "$partition" ]
    fi
}

# Platform-specific function: Mount a partition
mount_partition() {
    local partition="$1"
    local mount_point="$2"
    
    mkdir -p "$mount_point"
    
    if [ "$OS_TYPE" = "mac" ]; then
        # On Mac, first unmount if auto-mounted
        diskutil unmount "$partition" 2>/dev/null || true
        # Then mount to our location
        mount -t msdos "$partition" "$mount_point" 2>/dev/null || \
        mount -t exfat "$partition" "$mount_point" 2>/dev/null || \
        mount "$partition" "$mount_point"
    else
        mount "$partition" "$mount_point"
    fi
}

# Platform-specific function: Get real user home directory
get_real_home() {
    local user="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        dscl . -read "/Users/$user" NFSHomeDirectory 2>/dev/null | awk '{print $2}' || echo "/Users/$user"
    else
        getent passwd "$user" | cut -d: -f6
    fi
}

# Platform-specific function: Generate encrypted password
generate_encrypted_password() {
    local password="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        # macOS may not have openssl with -6 support, use Python as fallback
        if openssl passwd -6 -stdin <<< "$password" 2>/dev/null; then
            return
        fi
        # Fallback to Python
        python3 -c "import crypt; print(crypt.crypt('$password', crypt.mksalt(crypt.METHOD_SHA512)))" 2>/dev/null || \
        python3 -c "import hashlib,base64,os; salt=base64.b64encode(os.urandom(12)).decode()[:16]; print('\$6\$'+salt+'\$'+base64.b64encode(hashlib.pbkdf2_hmac('sha512','$password'.encode(),salt.encode(),5000)).decode()[:86])"
    else
        echo "$password" | openssl passwd -6 -stdin
    fi
}

# Configuration
CACHE_DIR="$HOME/.cache/qoom-pi-images"
# We'll fetch the latest image URL dynamically
# Using full Raspberry Pi OS (64-bit) with desktop - based on Debian Trixie
IMAGE_BASE_URL="https://downloads.raspberrypi.com/raspios_arm64/images/"
IMAGE_NAME="raspios-trixie-arm64.img"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Qoom Kit - Raspberry Pi Preparation${NC}"
echo -e "${BLUE}=============================================${NC}"
echo -e "${GREEN}Supports: Pi 5, Pi 4, Pi 3 (64-bit), Pi Zero 2 W${NC}"
echo -e "${GREEN}Runs on: Linux, macOS, and Windows (WSL)${NC}"
echo ""
echo "This script prepares an SD card for the Qoom platform."
echo "  - Installs Node.js, PM2, and dependencies"
echo "  - Configures WiFi and SSH access"
echo "  - Sets up the Qoom application"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (sudo)${NC}"
    echo "Usage: sudo $0"
    exit 1
fi

# Preserve the real user info for later
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(get_real_home "$REAL_USER")
CACHE_DIR="$REAL_HOME/.cache/qoom-pi-images"

# ===================================
# STEP 1: Detect SD Card
# ===================================
echo -e "${GREEN}Step 1: Detecting SD card...${NC}"
echo ""

# List available block devices
list_block_devices
echo ""

# Try to auto-detect SD card
SD_CARDS=$(detect_sd_cards)

if [ -z "$SD_CARDS" ]; then
    echo -e "${YELLOW}No SD card automatically detected.${NC}"
    echo "Please enter the device name manually."
else
    echo "Detected potential SD cards: $SD_CARDS"
fi

echo ""
if [ "$OS_TYPE" = "mac" ]; then
    read -p "Enter the SD card device name (e.g., disk2, disk3): " SD_DEVICE
else
    read -p "Enter the SD card device name (e.g., sdb, mmcblk0): " SD_DEVICE
fi

# Validate device exists
if ! device_exists "$SD_DEVICE"; then
    echo -e "${RED}Error: /dev/$SD_DEVICE does not exist${NC}"
    exit 1
fi

# Get device info
DEVICE_SIZE=$(get_device_size "$SD_DEVICE")
DEVICE_MODEL=$(get_device_model "$SD_DEVICE")

echo ""
echo "Selected device:"
echo -e "  Device: ${BLUE}/dev/$SD_DEVICE${NC}"
echo -e "  Size: $DEVICE_SIZE"
echo -e "  Model: $DEVICE_MODEL"
echo ""

# Check if SD card already has Raspberry Pi OS partitions
SKIP_IMAGING=false

# Determine partition names for checking (using platform-specific function)
CHECK_BOOT_PARTITION=$(get_partition_name "$SD_DEVICE" 1)
CHECK_ROOT_PARTITION=$(get_partition_name "$SD_DEVICE" 2)

# Check if partitions exist and look like Raspberry Pi OS
check_partition_exists() {
    local part="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        [ -e "$part" ] || diskutil info "$part" &>/dev/null
    else
        [ -b "$part" ]
    fi
}

if check_partition_exists "$CHECK_BOOT_PARTITION" && check_partition_exists "$CHECK_ROOT_PARTITION"; then
    echo -e "${GREEN}Existing partitions detected on this SD card!${NC}"
    echo ""
    
    # Try to identify if it's a Raspberry Pi OS installation
    TEMP_MOUNT="/tmp/qoom-check-$$"
    mkdir -p "$TEMP_MOUNT"
    
    # Check boot partition for Raspberry Pi files
    IS_RASPI_OS=false
    if mount -o ro "$CHECK_BOOT_PARTITION" "$TEMP_MOUNT" 2>/dev/null; then
        if [ -f "$TEMP_MOUNT/cmdline.txt" ] || [ -f "$TEMP_MOUNT/config.txt" ]; then
            IS_RASPI_OS=true
            echo -e "  ${GREEN}✓ Raspberry Pi OS boot partition detected${NC}"
        fi
        umount "$TEMP_MOUNT" 2>/dev/null || true
    fi
    rmdir "$TEMP_MOUNT" 2>/dev/null || true
    
    echo ""
    echo "What would you like to do?"
    echo "  1) Re-image the SD card (erase everything and start fresh)"
    echo "  2) Keep existing image and only reconfigure (WiFi, user, hostname, etc.)"
    echo "  3) Cancel"
    echo ""
    read -p "Enter choice [1/2/3]: " REIMAGE_CHOICE
    
    case "$REIMAGE_CHOICE" in
        1)
            echo ""
            echo -e "${YELLOW}WARNING: You chose to re-image the SD card.${NC}"
            echo -e "${RED}ALL DATA ON THIS DEVICE WILL BE PERMANENTLY ERASED!${NC}"
            echo ""
            read -p "Type 'YES' to confirm: " CONFIRM
            if [ "$CONFIRM" != "YES" ]; then
                echo "Operation cancelled."
                exit 1
            fi
            SKIP_IMAGING=false
            ;;
        2)
            echo ""
            echo -e "${GREEN}Skipping imaging - will only reconfigure the existing installation.${NC}"
            SKIP_IMAGING=true
            ;;
        3|*)
            echo "Operation cancelled."
            exit 1
            ;;
    esac
else
    # No existing partitions - must image
    echo -e "${YELLOW}No existing Raspberry Pi OS detected on this SD card.${NC}"
    echo ""
    echo -e "${YELLOW}WARNING: You are about to format the following device:${NC}"
    echo -e "  Device: ${RED}/dev/$SD_DEVICE${NC}"
    echo -e "  Size: $DEVICE_SIZE"
    echo -e "  Model: $DEVICE_MODEL"
    echo ""
    echo -e "${RED}ALL DATA ON THIS DEVICE WILL BE PERMANENTLY ERASED!${NC}"
    echo ""
    read -p "Are you absolutely sure you want to continue? Type 'YES' to confirm: " CONFIRM

    if [ "$CONFIRM" != "YES" ]; then
        echo "Operation cancelled."
        exit 1
    fi
    SKIP_IMAGING=false
fi

# ===================================
# STEP 2: Get Pi Configuration
# ===================================
echo ""
echo -e "${GREEN}Step 2: Pi Configuration${NC}"
echo ""

# Generate a short memorable name (used for both hostname and username)
# 25 adjectives x 50 nouns x 1000 numbers = 1,250,000 possible combinations
ADJECTIVES=(
    "swift" "brave" "happy" "quick" "smart"
    "cool" "tiny" "mega" "super" "ultra"
    "bright" "calm" "bold" "keen" "wise"
    "prime" "rapid" "vivid" "crisp" "sleek"
    "agile" "noble" "zesty" "witty" "lucky"
)
NOUNS=(
    "pi" "bot" "node" "chip" "byte"
    "bit" "core" "volt" "amp" "wave"
    "beam" "flux" "grid" "link" "mesh"
    "nest" "orb" "peak" "pod" "pulse"
    "ray" "spark" "star" "sync" "tech"
    "unit" "vibe" "wire" "zone" "arc"
    "base" "bell" "bolt" "buzz" "cell"
    "code" "cube" "dash" "deck" "dock"
    "dot" "edge" "fuse" "gate" "gem"
    "glow" "hub" "ion" "jet" "key"
)
RANDOM_ADJ=${ADJECTIVES[$RANDOM % ${#ADJECTIVES[@]}]}
RANDOM_NOUN=${NOUNS[$RANDOM % ${#NOUNS[@]}]}
RANDOM_NUM=$(printf "%03d" $((RANDOM % 1000)))
SUGGESTED_NAME="${RANDOM_ADJ}${RANDOM_NOUN}${RANDOM_NUM}"

echo -e "Generated Pi name: ${GREEN}$SUGGESTED_NAME${NC}"
echo "(This will be used as both the hostname and username)"
echo ""
read -p "Use this name? (Y/n, or enter custom name): " NAME_RESPONSE

if [[ "$NAME_RESPONSE" =~ ^[Nn]$ ]]; then
    read -p "Enter custom name: " CUSTOM_NAME
    PI_NAME="$CUSTOM_NAME"
elif [ -n "$NAME_RESPONSE" ] && [[ ! "$NAME_RESPONSE" =~ ^[Yy]$ ]] && [ "$NAME_RESPONSE" != "" ]; then
    # User entered a custom name directly
    PI_NAME="$NAME_RESPONSE"
else
    PI_NAME="$SUGGESTED_NAME"
fi

# Username is the same as Pi name
PI_USERNAME="$PI_NAME"

# Generate a 10-character secure password
PI_PASSWORD=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 10)
echo ""
echo -e "Generated secure password: ${GREEN}$PI_PASSWORD${NC}"
read -p "Use this password? (Y/n, or enter custom password): " PASSWORD_RESPONSE
if [[ "$PASSWORD_RESPONSE" =~ ^[Nn]$ ]]; then
    read -s -p "Enter custom password (min 8 characters): " CUSTOM_PASSWORD
    echo ""
    PI_PASSWORD="$CUSTOM_PASSWORD"
elif [ -n "$PASSWORD_RESPONSE" ] && [[ ! "$PASSWORD_RESPONSE" =~ ^[Yy]$ ]]; then
    # User entered a custom password directly
    PI_PASSWORD="$PASSWORD_RESPONSE"
fi

# ===================================
# STEP 3: Get WiFi Configuration
# ===================================
echo ""
echo -e "${GREEN}Step 3: WiFi Configuration${NC}"
echo ""

read -p "Enter WiFi SSID (network name): " WIFI_SSID
if [ -z "$WIFI_SSID" ]; then
    echo -e "${RED}Error: WiFi SSID is required${NC}"
    exit 1
fi

read -p "Enter WiFi password: " WIFI_PASSWORD
if [ -z "$WIFI_PASSWORD" ]; then
    echo -e "${RED}Error: WiFi password is required${NC}"
    exit 1
fi

read -p "Enter WiFi country code (e.g., US, GB, KR, JP) [US]: " WIFI_COUNTRY
WIFI_COUNTRY="${WIFI_COUNTRY:-US}"

# ===================================
# STEP 4: Confirm Configuration
# ===================================
echo ""
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}Configuration Summary${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""
echo "SD Card: /dev/$SD_DEVICE ($DEVICE_SIZE)"
echo ""
echo "Pi Configuration:"
echo "  Name: $PI_NAME"
echo "  Username: $PI_USERNAME"
echo "  Password: $PI_PASSWORD"
echo ""
echo "WiFi Configuration:"
echo "  SSID: $WIFI_SSID"
echo "  Country: $WIFI_COUNTRY"
echo ""
read -p "Is this correct? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "Setup cancelled. Please run the script again."
    exit 1
fi

# ===================================
# STEP 5, 6, 7: Imaging (skip if reconfiguring only)
# ===================================

if [ "$SKIP_IMAGING" = true ]; then
    echo ""
    echo -e "${YELLOW}Step 5: Skipping SD card formatting (reconfigure mode)${NC}"
    echo -e "${YELLOW}Step 6: Skipping image download (reconfigure mode)${NC}"
    echo -e "${YELLOW}Step 7: Skipping image write (reconfigure mode)${NC}"
    
    # Still need to unmount partitions before configuring
    echo ""
    unmount_device "$SD_DEVICE"
else
    # ===================================
    # STEP 5: Clean Format SD Card
    # ===================================
    echo ""
    echo -e "${GREEN}Step 5: Cleaning and formatting SD card...${NC}"

    # Unmount any mounted partitions
    unmount_device "$SD_DEVICE"

    # Wipe the partition table
    wipe_disk "$SD_DEVICE"

    echo "✓ SD card cleaned"

    # ===================================
    # STEP 6: Download Raspberry Pi OS
    # ===================================
    echo ""
    echo -e "${GREEN}Step 6: Checking for Raspberry Pi OS image...${NC}"
    echo ""
    echo "This script downloads Raspberry Pi OS (64-bit) with Desktop"
    echo "Based on Debian Trixie (Debian 13)"
    echo "Compatible with: Raspberry Pi 5, Pi 4, Pi 3 (64-bit), Pi Zero 2 W"
    echo ""

    mkdir -p "$CACHE_DIR"

    # Check for required tools
    if ! command -v wget &> /dev/null && ! command -v curl &> /dev/null; then
        echo -e "${RED}Error: wget or curl required${NC}"
        exit 1
    fi

    if ! command -v xz &> /dev/null; then
        echo "Installing xz-utils..."
        apt-get update && apt-get install -y xz-utils
    fi

    # Function to fetch the latest image URL dynamically
    # Returns only the URL to stdout, debug messages go to stderr
    fetch_latest_image_url() {
        echo "Fetching latest Raspberry Pi OS image information..." >&2
        
        # Get the directory listing and find the latest image folder
        # Try Trixie first, then fall back to latest available
        LATEST_DIR=$(curl -sL "$IMAGE_BASE_URL" | grep -oP 'raspios_arm64-\d{4}-\d{2}-\d{2}' | sort -V | tail -1)
        
        if [ -z "$LATEST_DIR" ]; then
            echo -e "${YELLOW}Warning: Could not fetch latest image list, using fallback URL${NC}" >&2
            # Fallback to known working URL - Raspberry Pi OS (64-bit) with Desktop
            echo "https://downloads.raspberrypi.com/raspios_arm64/images/raspios_arm64-2024-11-19/2024-11-19-raspios-bookworm-arm64.img.xz"
            return
        fi
        
        # Extract the date from the directory name
        IMAGE_DATE=$(echo "$LATEST_DIR" | grep -oP '\d{4}-\d{2}-\d{2}')
        
        # Determine the OS codename (trixie or bookworm) based on the date
        # Trixie images started appearing in late 2024
        # Try to detect from the actual filename on the server
        IMAGE_LIST_PAGE=$(curl -sL "${IMAGE_BASE_URL}${LATEST_DIR}/")
        
        if echo "$IMAGE_LIST_PAGE" | grep -q "trixie"; then
            OS_CODENAME="trixie"
        else
            OS_CODENAME="bookworm"
        fi
        
        echo "Found: ${LATEST_DIR} (${OS_CODENAME})" >&2
        
        # Construct the full URL - this is the ONLY thing that goes to stdout
        echo "https://downloads.raspberrypi.com/raspios_arm64/images/${LATEST_DIR}/${IMAGE_DATE}-raspios-${OS_CODENAME}-arm64.img.xz"
    }

    # Check if we have any cached images
    CACHED_IMAGES=$(ls "$CACHE_DIR"/*.img 2>/dev/null | head -1 || true)

    if [ -n "$CACHED_IMAGES" ]; then
        CACHED_IMAGE_NAME=$(basename "$CACHED_IMAGES")
        echo "Found cached image: $CACHED_IMAGE_NAME"
        read -p "Use cached image? (Y/n, 'n' will download the latest): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Nn]$ ]]; then
            IMAGE_PATH="$CACHED_IMAGES"
            echo "✓ Using cached image: $IMAGE_PATH"
        else
            # Remove old cached images
            rm -f "$CACHE_DIR"/*.img "$CACHE_DIR"/*.img.xz 2>/dev/null || true
            CACHED_IMAGES=""
        fi
    fi

    if [ -z "$CACHED_IMAGES" ] || [[ $REPLY =~ ^[Nn]$ ]]; then
        echo "Downloading Raspberry Pi OS (64-bit) with Desktop..."
        echo "Note: Full desktop image is ~1.1GB, this may take several minutes..."
        
        # Fetch the latest image URL
        IMAGE_URL=$(fetch_latest_image_url)
        echo "Image URL: $IMAGE_URL"
        
        # Extract image name from URL
        IMAGE_XZ_NAME=$(basename "$IMAGE_URL")
        IMAGE_NAME="${IMAGE_XZ_NAME%.xz}"
        IMAGE_PATH="$CACHE_DIR/$IMAGE_NAME"
        IMAGE_XZ_PATH="$CACHE_DIR/$IMAGE_XZ_NAME"
        
        # Download the image
        echo ""
        if command -v wget &> /dev/null; then
            wget --progress=bar:force -O "$IMAGE_XZ_PATH" "$IMAGE_URL"
        else
            curl -L --progress-bar -o "$IMAGE_XZ_PATH" "$IMAGE_URL"
        fi
        
        echo ""
        echo "Extracting image (this may take a few minutes for desktop image)..."
        xz -d "$IMAGE_XZ_PATH"
        
        echo "✓ Image downloaded and extracted: $IMAGE_PATH"
    fi

    # ===================================
    # STEP 7: Write Image to SD Card
    # ===================================
    echo ""
    echo -e "${GREEN}Step 7: Writing image to SD card...${NC}"
    echo "This will take several minutes..."

    # Ensure device is unmounted before writing
    unmount_device "$SD_DEVICE"

    write_image "$IMAGE_PATH" "$SD_DEVICE"

    sync

    echo "✓ Image written successfully"
fi

# ===================================
# STEP 8: Mount Boot Partition and Configure
# ===================================
echo ""
echo -e "${GREEN}Step 8: Configuring boot partition...${NC}"

# Determine partition names using platform-specific function
BOOT_PARTITION=$(get_partition_name "$SD_DEVICE" 1)
ROOT_PARTITION=$(get_partition_name "$SD_DEVICE" 2)

# Force kernel/system to re-read partition table
refresh_partitions "$SD_DEVICE"

# Wait for partitions to appear
if ! wait_for_partition "$BOOT_PARTITION" 30; then
    echo -e "${RED}Error: Boot partition not found at $BOOT_PARTITION${NC}"
    echo ""
    echo "Troubleshooting tips:"
    echo "  1. Try removing and reinserting the SD card"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "  2. Run: diskutil list"
        echo "  3. Check if the disk was ejected: diskutil info /dev/$SD_DEVICE"
    else
        echo "  2. Run: sudo partprobe /dev/$SD_DEVICE"
        echo "  3. Run: lsblk /dev/$SD_DEVICE"
    fi
    echo "  4. The image may not have been written correctly"
    echo ""
    echo "Current disks:"
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil list "/dev/$SD_DEVICE" 2>/dev/null || echo "  Device not found"
    else
        lsblk "/dev/$SD_DEVICE" 2>/dev/null || echo "  Device not found"
    fi
    exit 1
fi

echo "✓ Partitions detected: $BOOT_PARTITION, $ROOT_PARTITION"

# Create mount points
BOOT_MOUNT="/tmp/qoom-boot-$$"
ROOT_MOUNT="/tmp/qoom-root-$$"
mkdir -p "$BOOT_MOUNT" "$ROOT_MOUNT"

# On Mac, unmount any auto-mounted partitions first
if [ "$OS_TYPE" = "mac" ]; then
    diskutil unmount "$BOOT_PARTITION" 2>/dev/null || true
    diskutil unmount "$ROOT_PARTITION" 2>/dev/null || true
fi

# Mount partitions
echo "Mounting boot partition..."
mount_partition "$BOOT_PARTITION" "$BOOT_MOUNT"
echo "Mounting root partition..."
if [ "$OS_TYPE" = "mac" ]; then
    # On Mac, the root partition is ext4 which requires special handling
    # Check if we have ext4 support
    if command -v fuse-ext2 &>/dev/null || command -v ext4fuse &>/dev/null; then
        fuse-ext2 "$ROOT_PARTITION" "$ROOT_MOUNT" -o rw+ 2>/dev/null || \
        ext4fuse "$ROOT_PARTITION" "$ROOT_MOUNT" -o allow_other 2>/dev/null || {
            echo -e "${YELLOW}Warning: Could not mount ext4 partition with write access.${NC}"
            echo "On macOS, you need ext4 support. Install with:"
            echo "  brew install macfuse"
            echo "  brew install ext4fuse"
            echo ""
            echo "Alternatively, the basic configuration (SSH, user, WiFi) will be done,"
            echo "but the first-boot setup script cannot be installed."
            ROOT_MOUNT_FAILED=true
        }
    else
        echo -e "${YELLOW}Warning: ext4 filesystem support not found on macOS.${NC}"
        echo "On macOS, you need ext4 support to configure the root partition. Install with:"
        echo "  brew install macfuse"
        echo "  brew install ext4fuse"
        echo ""
        echo "The boot partition (SSH, user config) will still be configured."
        echo "WiFi and first-boot script require root partition access."
        ROOT_MOUNT_FAILED=true
    fi
else
    mount "$ROOT_PARTITION" "$ROOT_MOUNT"
fi

echo "✓ Partitions mounted"

# Enable SSH
echo "Enabling SSH..."
touch "$BOOT_MOUNT/ssh"
echo "✓ SSH enabled"

# Create user configuration (Raspberry Pi OS Bookworm+ method)
echo "Creating user configuration..."
ENCRYPTED_PASSWORD=$(generate_encrypted_password "$PI_PASSWORD")
echo "${PI_USERNAME}:${ENCRYPTED_PASSWORD}" > "$BOOT_MOUNT/userconf.txt"
echo "✓ User configured"

# Configure WiFi (requires root partition access)
if [ "${ROOT_MOUNT_FAILED:-false}" = "true" ]; then
    echo -e "${YELLOW}Skipping WiFi configuration (root partition not mounted)${NC}"
    echo "WiFi will need to be configured manually on first boot."
else
    echo "Configuring WiFi..."
    
    # For Raspberry Pi OS Bookworm, we use NetworkManager
    # Create the NetworkManager connection file
    mkdir -p "$ROOT_MOUNT/etc/NetworkManager/system-connections"
cat > "$ROOT_MOUNT/etc/NetworkManager/system-connections/preconfigured.nmconnection" << EOF
[connection]
id=$WIFI_SSID
uuid=$(cat /proc/sys/kernel/random/uuid)
type=wifi
autoconnect=true

[wifi]
mode=infrastructure
ssid=$WIFI_SSID

[wifi-security]
auth-alg=open
key-mgmt=wpa-psk
psk=$WIFI_PASSWORD

[ipv4]
method=auto

[ipv6]
method=auto
EOF

    chmod 600 "$ROOT_MOUNT/etc/NetworkManager/system-connections/preconfigured.nmconnection"
    echo "✓ WiFi configured"

    # Set hostname
    echo "Setting hostname to $PI_NAME..."
    echo "$PI_NAME" > "$ROOT_MOUNT/etc/hostname"
    # Use gsed on Mac if available, otherwise try sed with different syntax
    if [ "$OS_TYPE" = "mac" ]; then
        if command -v gsed &>/dev/null; then
            gsed -i "s/raspberrypi/$PI_NAME/g" "$ROOT_MOUNT/etc/hosts"
        else
            sed -i '' "s/raspberrypi/$PI_NAME/g" "$ROOT_MOUNT/etc/hosts"
        fi
    else
        sed -i "s/raspberrypi/$PI_NAME/g" "$ROOT_MOUNT/etc/hosts"
    fi
    echo "✓ Hostname set"
fi  # End of ROOT_MOUNT_FAILED check for WiFi/hostname

# ===================================
# STEP 9: Configure Repository
# ===================================
echo ""
echo -e "${GREEN}Step 9: Configuring Qoom repository...${NC}"
echo "The Pi will clone code from: https://github.com/Qoomio/AIoT.git"
echo "The code/ folder will be copied to projects/aiot/ on first boot"
echo "✓ Repository configured"

# ===================================
# STEP 10: Create First-Boot Setup Script
# ===================================
echo ""
if [ "${ROOT_MOUNT_FAILED:-false}" = "true" ]; then
    echo -e "${YELLOW}Step 10: Skipping first-boot script (root partition not mounted)${NC}"
    echo "The Pi will boot with basic configuration only."
    echo "You will need to manually set up Qoom after first boot."
else
    echo -e "${GREEN}Step 10: Creating first-boot setup script...${NC}"

    # Create the Qoom setup script that will run on first boot
    # Create directory for the setup script (NOT in /home to avoid user detection issues)
    mkdir -p "$ROOT_MOUNT/opt/qoom"

cat > "$ROOT_MOUNT/opt/qoom/firstboot-setup.sh" << 'QOOM_SETUP_EOF'
#!/bin/bash
# Qoom First-Boot Setup Script
# This script runs automatically on first boot

# Don't exit on error - we want to continue and log issues
set +e

# Configuration (will be replaced by sed)
PI_NAME="__PI_NAME__"
WIFI_SSID="__WIFI_SSID__"

# Setup logging - log to both /var/log and /boot for easy SD card reading
LOG_FILE="/var/log/qoom-setup.log"
BOOT_LOG="/boot/firmware/qoom-setup.log"

# Function to log to both locations
log_msg() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" | tee -a "$LOG_FILE" "$BOOT_LOG" 2>/dev/null || echo "$msg" >> "$LOG_FILE"
}

# Start logging
exec > >(while read line; do log_msg "$line"; done) 2>&1

echo "======================================"
echo "Qoom First-Boot Setup - $(date)"
echo "Pi Name: $PI_NAME"
echo "======================================"
echo ""

# Function to log detailed network status
log_network_status() {
    echo ""
    echo "=== Network Status Debug Info ==="
    echo "Date/Time: $(date)"
    echo ""
    echo "--- Hostname ---"
    hostname
    echo ""
    echo "--- Network Interfaces (ip addr) ---"
    ip addr 2>&1 || ifconfig 2>&1 || echo "Could not get interface info"
    echo ""
    echo "--- Wireless Interface Status ---"
    iw dev 2>&1 || echo "iw not available"
    echo ""
    echo "--- NetworkManager Status ---"
    systemctl status NetworkManager --no-pager 2>&1 | head -20 || echo "NetworkManager status unavailable"
    echo ""
    echo "--- NetworkManager Connections ---"
    nmcli connection show 2>&1 || echo "nmcli not available"
    echo ""
    echo "--- WiFi Networks Visible ---"
    nmcli device wifi list 2>&1 | head -20 || echo "Could not list WiFi networks"
    echo ""
    echo "--- Connection Files ---"
    ls -la /etc/NetworkManager/system-connections/ 2>&1 || echo "No connection files"
    echo ""
    echo "--- Routing Table ---"
    ip route 2>&1 || route -n 2>&1 || echo "Could not get routing info"
    echo ""
    echo "--- DNS Resolution Test ---"
    nslookup google.com 2>&1 | head -5 || echo "DNS lookup failed"
    echo ""
    echo "=== End Network Status ==="
    echo ""
}

# WiFi credentials (will be replaced by sed)
WIFI_PASSWORD="__WIFI_PASSWORD__"

# Function to recreate WiFi configuration file
recreate_wifi_config() {
    echo "Recreating WiFi configuration file..."
    
    local CONFIG_FILE="/etc/NetworkManager/system-connections/preconfigured.nmconnection"
    
    # Remove old config if exists
    rm -f "$CONFIG_FILE" 2>/dev/null || true
    
    # Create new config with correct credentials
    cat > "$CONFIG_FILE" << WIFI_EOF
[connection]
id=$WIFI_SSID
uuid=$(cat /proc/sys/kernel/random/uuid)
type=wifi
autoconnect=true

[wifi]
mode=infrastructure
ssid=$WIFI_SSID

[wifi-security]
auth-alg=open
key-mgmt=wpa-psk
psk=$WIFI_PASSWORD

[ipv4]
method=auto

[ipv6]
method=auto
WIFI_EOF

    # Set correct permissions (MUST be 600 for NetworkManager to use it)
    chmod 600 "$CONFIG_FILE"
    chown root:root "$CONFIG_FILE"
    
    echo "WiFi config recreated with SSID: $WIFI_SSID"
    echo "Config file permissions: $(ls -la $CONFIG_FILE)"
}

# Function to attempt WiFi connection/reconnection
attempt_wifi_connection() {
    echo "Attempting to connect to WiFi: $WIFI_SSID"
    
    # FIRST: Unblock WiFi (RF-kill is a common issue)
    echo "Unblocking WiFi..."
    rfkill unblock all 2>&1 || true
    rfkill unblock wifi 2>&1 || true
    sleep 1
    
    # Check if config file exists and has correct permissions
    local CONFIG_FILE="/etc/NetworkManager/system-connections/preconfigured.nmconnection"
    if [ ! -f "$CONFIG_FILE" ]; then
        echo "WiFi config file missing! Recreating..."
        recreate_wifi_config
    else
        # Check permissions - must be 600
        local PERMS=$(stat -c %a "$CONFIG_FILE" 2>/dev/null)
        if [ "$PERMS" != "600" ]; then
            echo "WiFi config has wrong permissions ($PERMS), fixing..."
            chmod 600 "$CONFIG_FILE"
        fi
    fi
    
    # Restart NetworkManager
    echo "Restarting NetworkManager..."
    systemctl restart NetworkManager
    sleep 5
    
    # Reload connections
    echo "Reloading NetworkManager connections..."
    nmcli connection reload
    sleep 2
    
    # Check if our connection exists
    if nmcli connection show | grep -q "$WIFI_SSID"; then
        echo "Found connection for $WIFI_SSID, attempting to activate..."
        nmcli connection up "$WIFI_SSID" 2>&1 || echo "Failed to activate by SSID name"
    fi
    
    # Also try by the preconfigured name
    nmcli connection up preconfigured 2>&1 || echo "Failed to activate preconfigured"
    
    # Try to bring up wlan0 manually
    echo "Ensuring wlan0 is up..."
    ip link set wlan0 up 2>&1 || echo "Could not bring up wlan0"
    
    # Scan for networks
    echo "Scanning for WiFi networks..."
    nmcli device wifi rescan 2>&1 || echo "Rescan failed"
    sleep 3
    
    # Show what networks are visible
    echo "Visible networks:"
    nmcli device wifi list 2>&1 | head -10
    
    sleep 5
}

# Function to check network connectivity
check_network() {
    ping -c 1 -W 3 8.8.8.8 &> /dev/null || ping -c 1 -W 3 1.1.1.1 &> /dev/null
    return $?
}

# Function to unblock WiFi (handle RF-kill)
unblock_wifi() {
    echo "Checking RF-kill status..."
    rfkill list 2>&1 || echo "rfkill command not available"
    
    echo "Unblocking all wireless devices..."
    rfkill unblock all 2>&1 || echo "Could not unblock via rfkill"
    rfkill unblock wifi 2>&1 || echo "Could not unblock wifi specifically"
    rfkill unblock wlan 2>&1 || echo "Could not unblock wlan"
    
    # Also try via /sys
    for rf in /sys/class/rfkill/rfkill*/state; do
        if [ -f "$rf" ]; then
            echo "Unblocking $rf..."
            echo 1 > "$rf" 2>/dev/null || true
        fi
    done
    
    sleep 2
    
    # Enable WiFi via NetworkManager
    echo "Enabling WiFi via nmcli..."
    nmcli radio wifi on 2>&1 || echo "Could not enable via nmcli"
    
    sleep 2
    echo "RF-kill status after unblock:"
    rfkill list 2>&1 || true
    echo ""
    echo "WiFi radio status:"
    nmcli radio 2>&1 || true
}

echo "Starting network connectivity check..."
echo ""

# FIRST: Unblock WiFi in case RF-kill is enabled
echo "=== Unblocking WiFi (RF-kill) ==="
unblock_wifi
echo ""

# Log initial network status
echo "=== Initial Network Status (after unblocking) ==="
log_network_status

# Wait for network with detailed logging
NETWORK_UP=false
MAX_WAIT=600  # 10 minutes for first attempt
RETRY_INTERVAL=10

echo "Waiting for network connectivity (max ${MAX_WAIT}s)..."

for ((i=0; i<=MAX_WAIT; i+=RETRY_INTERVAL)); do
    if check_network; then
        echo "Network is up after ${i} seconds!"
        NETWORK_UP=true
        break
    fi
    
    # Log progress every 30 seconds
    if [ $((i % 30)) -eq 0 ] && [ $i -gt 0 ]; then
        echo "Still waiting for network... (${i}/${MAX_WAIT}s)"
        # Log brief status
        echo "  WiFi status: $(nmcli -t -f WIFI g 2>/dev/null || echo 'unknown')"
        echo "  wlan0 state: $(cat /sys/class/net/wlan0/operstate 2>/dev/null || echo 'unknown')"
    fi
    
    # At 2 minutes, do first retry
    if [ $i -eq 120 ]; then
        echo ""
        echo "=== 2 minutes elapsed - attempting WiFi reconnection ==="
        log_network_status
        attempt_wifi_connection
    fi
    
    # At 5 minutes, do another retry
    if [ $i -eq 300 ]; then
        echo ""
        echo "=== 5 minutes elapsed - attempting WiFi reconnection again ==="
        log_network_status
        attempt_wifi_connection
    fi
    
    sleep $RETRY_INTERVAL
done

# If still no network after 10 minutes, do extended retry
if [ "$NETWORK_UP" = false ]; then
    echo ""
    echo "=========================================="
    echo "WARNING: No network after 10 minutes!"
    echo "Starting extended WiFi troubleshooting..."
    echo "=========================================="
    echo ""
    
    log_network_status
    
    # Try more aggressive recovery
    echo "Attempting aggressive WiFi recovery..."
    
    # Stop NetworkManager
    systemctl stop NetworkManager
    sleep 3
    
    # CRITICAL: Unblock RF-kill first
    echo "Unblocking RF-kill..."
    rfkill unblock all 2>&1 || true
    rfkill unblock wifi 2>&1 || true
    echo "RF-kill status:"
    rfkill list 2>&1 || true
    sleep 2
    
    # Reset wireless interface
    echo "Resetting wireless interface..."
    ip link set wlan0 down 2>&1 || true
    sleep 2
    ip link set wlan0 up 2>&1 || true
    sleep 2
    
    # Recreate WiFi config from scratch
    echo "Recreating WiFi configuration from scratch..."
    recreate_wifi_config
    
    # Restart NetworkManager
    systemctl start NetworkManager
    sleep 10
    
    # Enable WiFi via nmcli
    echo "Enabling WiFi via nmcli..."
    nmcli radio wifi on 2>&1 || true
    sleep 3
    
    # Try to connect
    attempt_wifi_connection
    
    # Wait another 10 minutes
    echo ""
    echo "Waiting additional 10 minutes for network..."
    for ((i=0; i<=600; i+=RETRY_INTERVAL)); do
        if check_network; then
            echo "Network is up after extended wait!"
            NETWORK_UP=true
            break
        fi
        
        if [ $((i % 60)) -eq 0 ] && [ $i -gt 0 ]; then
            echo "Extended wait: ${i}/600s - still no network"
            echo "  wlan0 state: $(cat /sys/class/net/wlan0/operstate 2>/dev/null || echo 'unknown')"
        fi
        
        # Retry at 5 minutes of extended wait
        if [ $i -eq 300 ]; then
            echo "Extended retry attempt..."
            attempt_wifi_connection
        fi
        
        sleep $RETRY_INTERVAL
    done
fi

# Final network status
echo ""
echo "=== Final Network Status ==="
log_network_status

if [ "$NETWORK_UP" = false ]; then
    echo ""
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "CRITICAL: Network connection FAILED"
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo ""
    echo "The Pi could not connect to WiFi after 20 minutes of trying."
    echo "Please check:"
    echo "  1. WiFi SSID and password are correct"
    echo "  2. The WiFi network is in range"
    echo "  3. The WiFi router is powered on"
    echo ""
    echo "You can view this log by inserting the SD card into"
    echo "another computer and reading:"
    echo "  - /boot/firmware/qoom-setup.log (FAT32 partition)"
    echo "  - /var/log/qoom-setup.log (ext4 partition)"
    echo ""
    echo "Continuing with setup anyway (some steps may fail)..."
    echo ""
else
    echo ""
    echo "✓ Network is connected!"
    echo "  IP Address: $(hostname -I | awk '{print $1}')"
    echo ""
fi

# ===================================
# Wait for NTP time synchronization
# ===================================
echo "Waiting for system clock to synchronize via NTP..."
echo "(Raspberry Pi has no hardware clock, NTP sync is required for HTTPS)"

# Enable NTP
timedatectl set-ntp true 2>/dev/null || systemctl start systemd-timesyncd 2>/dev/null || true

# Wait for time sync (max 2 minutes)
NTP_SYNCED=false
NTP_MAX_WAIT=120
NTP_WAIT=0

while [ $NTP_WAIT -lt $NTP_MAX_WAIT ]; do
    # Check if time is synchronized
    if timedatectl show --property=NTPSynchronized --value 2>/dev/null | grep -q "yes"; then
        NTP_SYNCED=true
        break
    fi
    
    # Alternative check for older systems
    if timedatectl status 2>/dev/null | grep -q "synchronized: yes"; then
        NTP_SYNCED=true
        break
    fi
    
    # Check if year is reasonable (2025 or later)
    CURRENT_YEAR=$(date +%Y)
    if [ "$CURRENT_YEAR" -ge 2025 ]; then
        # Additional sanity check - try an HTTPS connection
        if curl -sI --connect-timeout 5 https://github.com >/dev/null 2>&1; then
            echo "Clock appears correct (year: $CURRENT_YEAR), HTTPS working"
            NTP_SYNCED=true
            break
        fi
    fi
    
    if [ $((NTP_WAIT % 10)) -eq 0 ]; then
        echo "  Waiting for NTP sync... ($NTP_WAIT/$NTP_MAX_WAIT seconds)"
        echo "  Current time: $(date)"
    fi
    
    sleep 5
    NTP_WAIT=$((NTP_WAIT + 5))
done

if [ "$NTP_SYNCED" = true ]; then
    echo "✓ System clock synchronized: $(date)"
else
    echo "WARNING: NTP sync timeout. Current time: $(date)"
    echo "Attempting to continue anyway..."
    # Try to set a reasonable time as fallback
    # This at least prevents "certificate not yet valid" errors
    if [ "$(date +%Y)" -lt 2025 ]; then
        echo "Clock is severely wrong, attempting manual time set..."
        date -s "2026-01-07 12:00:00" 2>/dev/null || true
    fi
fi
echo ""

# Get current user (the one created during image config)
# IMPORTANT: Only list directories, not files
SETUP_USER=$(find /home -maxdepth 1 -mindepth 1 -type d ! -name "lost+found" -printf "%f\n" | head -1)
SETUP_HOME="/home/$SETUP_USER"

if [ -z "$SETUP_USER" ] || [ ! -d "$SETUP_HOME" ]; then
    echo "ERROR: Could not detect user. Found: '$SETUP_USER'"
    echo "Contents of /home:"
    ls -la /home
    echo "Attempting fallback detection..."
    # Fallback: look for a directory that looks like a username (not a script)
    SETUP_USER=$(ls -d /home/*/ 2>/dev/null | grep -v "lost+found" | head -1 | xargs -r basename)
    SETUP_HOME="/home/$SETUP_USER"
fi

echo "Running setup for user: $SETUP_USER"
echo "Home directory: $SETUP_HOME"
echo ""

# Step 1: Install Node.js using nvm
echo ""
echo "Step 1: Installing Node.js 24 using nvm..."

export NVM_DIR="$SETUP_HOME/.nvm"

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "Fetching latest nvm version..."
    NVM_VERSION=$(curl -s https://api.github.com/repos/nvm-sh/nvm/releases/latest | grep -oP '"tag_name": "\K[^"]+' || echo "")
    
    if [ -z "$NVM_VERSION" ]; then
        echo "Could not fetch latest version, using v0.40.1 as fallback"
        NVM_VERSION="v0.40.1"
    else
        echo "Latest nvm version: $NVM_VERSION"
    fi
    
    echo "Installing nvm..."
    sudo -u "$SETUP_USER" bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash"
fi

# Source nvm and install Node
echo "Installing Node.js 24..."
sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    [ -s \"\$NVM_DIR/bash_completion\" ] && source \"\$NVM_DIR/bash_completion\"
    nvm install 24
    nvm alias default 24
    nvm use 24
    echo \"Node.js installed: \$(node -v)\"
    echo \"NPM version: \$(npm -v)\"
"

echo "✓ Node.js installed"

# Step 2: Install PM2
echo ""
echo "Step 2: Installing PM2..."
sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    npm install -g pm2
    echo \"PM2 installed: \$(pm2 -v)\"
"
echo "✓ PM2 installed"

# Step 3: Install Git
echo ""
echo "Step 3: Installing Git and build tools..."
apt-get update

# Install git if not present
if ! command -v git &> /dev/null; then
    apt-get install -y git
fi
echo "Git installed: $(git --version)"

# Install build tools required for native modules (node-pty, etc.)
echo "Installing build tools for native modules..."
apt-get install -y build-essential python3 make g++ 2>&1 || echo "Warning: Some build tools may not have installed"

# Install development libraries for AIoT/camera projects (picamera2, etc.)
echo "Installing development libraries for AIoT projects..."
apt-get install -y \
    libcap-dev \
    python3-dev \
    python3-libcamera \
    python3-picamera2 \
    libcamera-dev \
    2>&1 || echo "Warning: Some AIoT dependencies may not have installed"

# Install uv (fast Python package manager)
echo "Installing uv (Python package manager)..."
if ! command -v uv &> /dev/null; then
    # Install uv for the user (not root)
    sudo -u "$SETUP_USER" bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh' 2>&1 || echo "Warning: uv installation may have failed"
    
    # Add uv to PATH in user's bashrc if not already there
    if ! grep -q "\.local/bin" "$SETUP_HOME/.bashrc" 2>/dev/null; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SETUP_HOME/.bashrc"
        chown "$SETUP_USER:$SETUP_USER" "$SETUP_HOME/.bashrc"
    fi
    echo "✓ uv installed"
else
    echo "uv is already installed: $(uv --version)"
fi

echo "✓ Git, build tools, and uv installed"

# Step 4: Clone Qoom application from GitHub
echo ""
echo "Step 4: Cloning Qoom application from GitHub..."
REPO_DIR="$SETUP_HOME/qoom"
REPO_URL="https://github.com/Qoomio/AIoT.git"

# Remove existing directory if it exists
if [ -d "$REPO_DIR" ]; then
    echo "Removing existing qoom directory..."
    rm -rf "$REPO_DIR"
fi

# Clone the repository
echo "Cloning from $REPO_URL..."
sudo -u "$SETUP_USER" git clone "$REPO_URL" "$REPO_DIR" 2>&1

if [ -d "$REPO_DIR" ]; then
    chown -R "$SETUP_USER:$SETUP_USER" "$REPO_DIR"
    echo "✓ Qoom application cloned successfully"
    
    # Copy AIoT code from cloned repo to projects folder
    if [ -d "$REPO_DIR/code" ]; then
        echo ""
        echo "Copying AIoT kit code to projects folder..."
        # Create projects folder as the user (not root) to ensure proper ownership
        sudo -u "$SETUP_USER" mkdir -p "$REPO_DIR/projects/aiot"
        # Copy files and ensure proper ownership
        cp -r "$REPO_DIR/code/." "$REPO_DIR/projects/aiot/"
        # Ensure the entire projects directory tree is owned by the user
        chown -R "$SETUP_USER:$SETUP_USER" "$REPO_DIR/projects"
        echo "  ✓ AIoT code copied to $REPO_DIR/projects/aiot/"
        
        # List the copied files
        echo "  Files:"
        ls -la "$REPO_DIR/projects/aiot/"
    else
        echo "Note: No code/ folder found in cloned repository"
    fi
    
    # Step 5: Run the deployment script
    echo ""
    echo "Step 5: Running deployment script..."
    echo "This will install dependencies and start the application..."
    
    # Create logs directory with proper ownership (used by PM2)
    sudo -u "$SETUP_USER" mkdir -p "$SETUP_HOME/logs"
    echo "  ✓ Logs directory created"
    
    # The deploy_aiot.sh script handles npm install and PM2 start
    # We need to run it inline (not in background) for first boot
    sudo -u "$SETUP_USER" bash -c "
        export NVM_DIR='$NVM_DIR'
        export NODE_ENV='education'
        [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
        cd '$REPO_DIR'
        
        # Check if uv is installed, install if not
        if ! command -v uv &> /dev/null; then
            echo 'Installing uv...'
            curl -LsSf https://astral.sh/uv/install.sh | sh
        fi
        
        echo 'Installing npm packages...'
        npm install
        
        # Build the editer bundle (required for the editor to work)
        echo 'Building editer bundle...'
        npm run build:editer 2>&1 || echo 'Warning: editer build failed, may not have build script'
        
        # Delete existing pm2 process if any
        pm2 delete aiot 2>/dev/null || true
        
        # Start new pm2 process using ecosystem config
        echo 'Starting application with PM2...'
        pm2 start ecosystem.config.cjs
        
        # Save pm2 configuration
        pm2 save
        
        echo 'Deployment completed!'
    "
    echo "✓ Application deployed and started"
    
    # Verify the app is running
    echo ""
    echo "Checking application status..."
    sudo -u "$SETUP_USER" bash -c "
        export NVM_DIR='$NVM_DIR'
        [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
        pm2 list
    "
else
    echo -e "ERROR: Failed to clone repository from $REPO_URL"
    echo "Please check network connectivity and try cloning manually:"
    echo "  git clone $REPO_URL ~/qoom"
fi

# Step 6: Setup Python/AIoT projects with system-site-packages
echo ""
echo "Step 6: Setting up Python/AIoT projects..."

# Function to setup a Python project with system-site-packages for uv
setup_python_project() {
    local project_dir="$1"
    local project_name=$(basename "$project_dir")
    
    if [ -f "$project_dir/pyproject.toml" ] || [ -f "$project_dir/requirements.txt" ]; then
        echo "  Setting up $project_name..."
        
        # Create venv with uv
        sudo -u "$SETUP_USER" bash -c "
            export PATH=\"\$HOME/.local/bin:\$PATH\"
            cd '$project_dir'
            uv venv 2>&1
        "
        
        # Patch pyvenv.cfg to enable system-site-packages (for libcamera, picamera2, etc.)
        local pyvenv_cfg="$project_dir/.venv/pyvenv.cfg"
        if [ -f "$pyvenv_cfg" ]; then
            if grep -q "include-system-site-packages" "$pyvenv_cfg"; then
                sed -i 's/include-system-site-packages = false/include-system-site-packages = true/' "$pyvenv_cfg"
            else
                echo "include-system-site-packages = true" >> "$pyvenv_cfg"
            fi
            chown "$SETUP_USER:$SETUP_USER" "$pyvenv_cfg"
        fi
        
        echo "  ✓ $project_name ready (use 'uv run main.py')"
    fi
}

# Setup aiot and other Python projects in the projects folder
if [ -d "$REPO_DIR/projects" ]; then
    for project in "$REPO_DIR/projects"/*/; do
        if [ -d "$project" ]; then
            setup_python_project "$project"
        fi
    done
fi
echo "✓ Python projects configured"

# Final ownership fix - ensure all files created during setup are owned by the user
# This catches any files that may have been created by root during the setup process
echo ""
echo "Fixing file ownership..."
if [ -d "$REPO_DIR" ]; then
    chown -R "$SETUP_USER:$SETUP_USER" "$REPO_DIR"
    echo "  ✓ $REPO_DIR ownership fixed"
fi
if [ -d "$SETUP_HOME/logs" ]; then
    chown -R "$SETUP_USER:$SETUP_USER" "$SETUP_HOME/logs"
    echo "  ✓ $SETUP_HOME/logs ownership fixed"
fi
echo "✓ File ownership corrected"

# Step 7: Setup PM2 startup (auto-start on boot)
echo ""
echo "Step 7: Configuring PM2 auto-start on boot..."

# Get the PM2 startup command and execute it
PM2_STARTUP_OUTPUT=$(sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    pm2 startup systemd -u $SETUP_USER --hp $SETUP_HOME 2>&1
" || true)

echo "$PM2_STARTUP_OUTPUT"

# Extract and execute the startup command
STARTUP_CMD=$(echo "$PM2_STARTUP_OUTPUT" | grep "sudo env" || true)

if [ -n "$STARTUP_CMD" ]; then
    echo "Executing PM2 startup command..."
    eval "$STARTUP_CMD" || echo "Warning: PM2 startup command may have failed"
    
    # Verify the systemd service was created
    if systemctl list-unit-files | grep -q "pm2-" 2>/dev/null; then
        echo "✓ PM2 systemd service created"
    fi
fi

# Save the current PM2 process list
sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    pm2 save
"
echo "✓ PM2 startup configured"

# Cleanup - disable this first-boot service so it doesn't run again
systemctl disable qoom-firstboot.service 2>/dev/null || true

# Get local IP address for display
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "======================================"
echo "Qoom First-Boot Setup Complete!"
echo "======================================"
echo ""
echo "Summary:"
echo "  ✓ Node.js 24 installed"
echo "  ✓ PM2 installed and configured"
echo "  ✓ Git installed"
echo "  ✓ Qoom application cloned from GitHub"
echo "  ✓ Application deployed: $REPO_DIR"
echo ""
echo "Access your Pi locally:"
echo "  Web: http://${LOCAL_IP}:3000"
echo "  SSH: ssh $SETUP_USER@${LOCAL_IP}"
echo ""
echo "To update the application:"
echo "  cd ~/qoom && bash scripts/deploy_aiot.sh"
echo ""
echo "Useful commands:"
echo "  pm2 list                           - View running processes"
echo "  pm2 logs                           - View application logs"
echo "  pm2 restart all                    - Restart the application"
echo "  cat /var/log/qoom-setup.log        - View this setup log"
echo ""
echo "Setup completed at: $(date)"
echo ""
QOOM_SETUP_EOF

# Replace placeholders in setup script
sed -i "s|__PI_NAME__|$PI_NAME|g" "$ROOT_MOUNT/opt/qoom/firstboot-setup.sh"
sed -i "s|__WIFI_SSID__|$WIFI_SSID|g" "$ROOT_MOUNT/opt/qoom/firstboot-setup.sh"
sed -i "s|__WIFI_PASSWORD__|$WIFI_PASSWORD|g" "$ROOT_MOUNT/opt/qoom/firstboot-setup.sh"
chmod +x "$ROOT_MOUNT/opt/qoom/firstboot-setup.sh"

# Create systemd service for first-boot
cat > "$ROOT_MOUNT/etc/systemd/system/qoom-firstboot.service" << EOF
[Unit]
Description=Qoom First Boot Setup
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/qoom/firstboot-setup.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
ln -sf /etc/systemd/system/qoom-firstboot.service "$ROOT_MOUNT/etc/systemd/system/multi-user.target.wants/qoom-firstboot.service"

echo "✓ First-boot setup script created"

fi  # End of ROOT_MOUNT_FAILED check for Step 10

# ===================================
# STEP 11: Cleanup and Finish
# ===================================
echo ""
echo -e "${GREEN}Step 11: Finishing up...${NC}"

sync

# Unmount partitions (platform-specific)
if [ "$OS_TYPE" = "mac" ]; then
    # On Mac, use diskutil for clean unmount
    umount "$BOOT_MOUNT" 2>/dev/null || diskutil unmount "$BOOT_MOUNT" 2>/dev/null || true
    if [ "${ROOT_MOUNT_FAILED:-false}" != "true" ]; then
        umount "$ROOT_MOUNT" 2>/dev/null || diskutil unmount "$ROOT_MOUNT" 2>/dev/null || true
    fi
    # Eject the disk for safe removal
    diskutil eject "/dev/$SD_DEVICE" 2>/dev/null || true
else
    umount "$BOOT_MOUNT" 2>/dev/null || true
    if [ "${ROOT_MOUNT_FAILED:-false}" != "true" ]; then
        umount "$ROOT_MOUNT" 2>/dev/null || true
    fi
fi
rmdir "$BOOT_MOUNT" 2>/dev/null || true
rmdir "$ROOT_MOUNT" 2>/dev/null || true

echo "✓ Partitions unmounted"

# Save credentials to a file for user reference
CREDS_FILE="$REAL_HOME/pi-credentials-${PI_NAME}.txt"

# Build the credentials file content
cat > "$CREDS_FILE" << EOF
Qoom Kit - Raspberry Pi Credentials
======================================
Created: $(date)

Pi Name: $PI_NAME
Username: $PI_USERNAME
Password: $PI_PASSWORD

WiFi SSID: $WIFI_SSID
WiFi Country: $WIFI_COUNTRY

Local Access (after first boot completes):
  Web: http://<pi-ip-address>:3000
  SSH: ssh $PI_USERNAME@<pi-ip-address>

Code Source: https://github.com/Qoomio/AIoT.git

After first boot:
1. Wait 5-10 minutes for the Pi to complete setup
2. Find the Pi's IP address using your router or: arp -a | grep -i raspberry
3. Access Qoom locally: http://<pi-ip-address>:3000
4. SSH into the Pi: ssh $PI_USERNAME@<pi-ip-address>
5. Check the setup log: cat /var/log/qoom-setup.log

To update the application:
  cd ~/qoom && bash scripts/deploy_aiot.sh

Useful commands:
  pm2 list                    - View running processes
  pm2 logs                    - View application logs
  pm2 restart all             - Restart the application
EOF

chown "$REAL_USER:$REAL_USER" "$CREDS_FILE"

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}SD Card Preparation Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo "Configuration saved to: $CREDS_FILE"
echo ""
echo -e "${GREEN}Credentials:${NC}"
echo "  Username: $PI_USERNAME"
echo "  Password: $PI_PASSWORD"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Safely eject the SD card and insert it into the Raspberry Pi"
echo "  2. Power on the Raspberry Pi (Pi 5, Pi 4, Pi 3 64-bit, or Pi Zero 2 W)"
echo "  3. Wait 5-10 minutes for setup to complete"
echo "     The Pi will clone code from: https://github.com/Qoomio/AIoT.git"
echo "     The Pi will automatically:"
echo "       - Connect to WiFi"
echo "       - Install Node.js 24, PM2, and Git"
echo "       - Install npm dependencies"
echo "       - Start the Qoom application"
echo ""
echo "  4. Access Qoom locally:"
echo "     Web: http://<pi-ip-address>:3000"
echo "     (Use your router's admin page or 'arp -a' to find the Pi's IP)"
echo ""
echo "  5. SSH into the Pi: ssh $PI_USERNAME@<pi-ip-address>"
echo "  6. Check setup log: cat /var/log/qoom-setup.log"
echo ""
echo -e "${YELLOW}Note:${NC} This image includes the full desktop environment (Debian Trixie)."
echo "WiFi should connect automatically. If not, check: sudo nmcli device wifi list"
echo "The desktop will be available if you connect a monitor."
echo ""

# Platform-specific notes
if [ "$OS_TYPE" = "mac" ]; then
    if [ "${ROOT_MOUNT_FAILED:-false}" = "true" ]; then
        echo -e "${YELLOW}⚠️  macOS Limitation:${NC}"
        echo "The root partition (ext4) could not be mounted for full configuration."
        echo "Basic setup (SSH, user) is configured, but WiFi and Qoom auto-setup are not."
        echo ""
        echo "After first boot, you will need to:"
        echo "  1. Connect the Pi via ethernet or configure WiFi manually"
        echo "  2. SSH into the Pi and run the Qoom setup manually"
        echo ""
        echo "To enable full macOS support, install ext4 tools:"
        echo "  brew install macfuse && brew install ext4fuse"
        echo ""
    else
        echo -e "${GREEN}✓ Full configuration completed on macOS${NC}"
        echo ""
    fi
elif [ "$OS_TYPE" = "wsl" ]; then
    echo -e "${GREEN}✓ Full configuration completed via WSL${NC}"
    echo ""
    echo -e "${YELLOW}WSL Tips:${NC}"
    echo "If you had trouble accessing your SD card in WSL2, for next time:"
    echo "  1. Install usbipd-win: winget install usbipd"
    echo "  2. From PowerShell (Admin): usbipd list"
    echo "  3. Attach the SD card reader: usbipd bind --busid <BUSID>"
    echo "  4. In WSL: sudo usbipd attach --wsl --busid <BUSID>"
    echo ""
fi

echo "The Raspberry Pi SD card is ready!"
echo ""

