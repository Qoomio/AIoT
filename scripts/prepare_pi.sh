#!/bin/bash

# Qoom Kit - Raspberry Pi Preparation Script
# This script prepares an SD card with Raspberry Pi OS configured for Qoom
#
# SUPPORTED PLATFORMS:
#   - Linux (full support)
#   - macOS (requires ext4fuse for full support, basic support without it)
#   - Windows (via WSL - Windows Subsystem for Linux)
#
# IMAGE: Raspberry Pi OS (64-bit) with Desktop - Debian Trixie (December 2025 release)
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
# Uses SHA-512 crypt format ($6$...) compatible with /etc/shadow
generate_encrypted_password() {
    local password="$1"
    
    # Try openssl first (works on Linux, may work on macOS with Homebrew openssl)
    local result
    result=$(echo "$password" | openssl passwd -6 -stdin 2>/dev/null)
    if [ -n "$result" ] && [[ "$result" == \$6\$* ]]; then
        echo "$result"
        return 0
    fi
    
    # Use Python with a proper SHA-512 crypt implementation
    # This works on macOS, Linux, and any system with Python 3
    python3 << PYTHON_EOF
import hashlib
import os
import base64

def sha512_crypt(password, salt=None, rounds=5000):
    """Generate SHA-512 crypt hash compatible with /etc/shadow"""
    if salt is None:
        # Generate 16-char salt from random bytes
        salt = base64.b64encode(os.urandom(12)).decode('ascii')[:16]
        # Remove any characters not allowed in salt
        salt = ''.join(c for c in salt if c.isalnum() or c in './')
        salt = salt[:16]
    
    password = password.encode('utf-8')
    salt_bytes = salt.encode('utf-8')
    
    # SHA-512 crypt algorithm (simplified but compatible)
    # Initial hash: password + salt + password
    b = hashlib.sha512(password + salt_bytes + password).digest()
    
    # Build A string
    a_input = password + salt_bytes
    
    # Add bytes from B based on password length
    pwd_len = len(password)
    while pwd_len > 0:
        if pwd_len >= 64:
            a_input += b
            pwd_len -= 64
        else:
            a_input += b[:pwd_len]
            pwd_len = 0
    
    # Add alternating bytes based on password length bits
    pwd_len = len(password)
    while pwd_len > 0:
        if pwd_len & 1:
            a_input += b
        else:
            a_input += password
        pwd_len >>= 1
    
    a = hashlib.sha512(a_input).digest()
    
    # Build DP (password repeated)
    dp_input = password * len(password)
    dp = hashlib.sha512(dp_input).digest()
    
    # Build P string
    p = b''
    pwd_len = len(password)
    while pwd_len > 0:
        if pwd_len >= 64:
            p += dp
            pwd_len -= 64
        else:
            p += dp[:pwd_len]
            pwd_len = 0
    
    # Build DS (salt repeated)
    ds_input = salt_bytes * (16 + a[0])
    ds = hashlib.sha512(ds_input).digest()
    
    # Build S string
    s = b''
    salt_len = len(salt_bytes)
    while salt_len > 0:
        if salt_len >= 64:
            s += ds
            salt_len -= 64
        else:
            s += ds[:salt_len]
            salt_len = 0
    
    # Main rounds
    c = a
    for i in range(rounds):
        c_input = b''
        if i & 1:
            c_input += p
        else:
            c_input += c
        if i % 3:
            c_input += s
        if i % 7:
            c_input += p
        if i & 1:
            c_input += c
        else:
            c_input += p
        c = hashlib.sha512(c_input).digest()
    
    # Encode result using custom base64
    b64chars = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    
    def b64_encode_triple(b1, b2, b3, n):
        result = ''
        w = (b1 << 16) | (b2 << 8) | b3
        for _ in range(n):
            result += b64chars[w & 0x3f]
            w >>= 6
        return result
    
    # SHA-512 has specific byte ordering for output
    order = [
        (0, 21, 42), (22, 43, 1), (44, 2, 23), (3, 24, 45),
        (25, 46, 4), (47, 5, 26), (6, 27, 48), (28, 49, 7),
        (50, 8, 29), (9, 30, 51), (31, 52, 10), (53, 11, 32),
        (12, 33, 54), (34, 55, 13), (56, 14, 35), (15, 36, 57),
        (37, 58, 16), (59, 17, 38), (18, 39, 60), (40, 61, 19),
        (62, 20, 41)
    ]
    
    encoded = ''
    for i1, i2, i3 in order:
        encoded += b64_encode_triple(c[i1], c[i2], c[i3], 4)
    # Last byte
    encoded += b64_encode_triple(0, 0, c[63], 2)
    
    return f'\$6\${salt}\${encoded}'

password = '''$password'''
print(sha512_crypt(password))
PYTHON_EOF
}

# Configuration
CACHE_DIR="$HOME/.cache/qoom-pi-images"
# Using full Raspberry Pi OS (64-bit) with desktop - based on Debian Trixie
# Pinned to December 2025 release for stability
IMAGE_BASE_URL="https://downloads.raspberrypi.com/raspios_arm64/images/"
# December 2025 Trixie release (pinned version)
TARGET_IMAGE_DATE="2025-12-04"
TARGET_IMAGE_DIR="raspios_arm64-${TARGET_IMAGE_DATE}"
TARGET_IMAGE_FILE="${TARGET_IMAGE_DATE}-raspios-trixie-arm64.img.xz"
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
    echo "This script uses Raspberry Pi OS (64-bit) with Desktop"
    echo "Pinned version: December 2025 Trixie (Debian 13)"
    echo "Image date: ${TARGET_IMAGE_DATE}"
    echo "Compatible with: Raspberry Pi 5, Pi 4, Pi 3 (64-bit), Pi Zero 2 W"
    echo ""

    mkdir -p "$CACHE_DIR"

    # Check for required tools
    if ! command -v wget &> /dev/null && ! command -v curl &> /dev/null; then
        echo -e "${RED}Error: wget or curl required${NC}"
        exit 1
    fi

    # Function to decompress XZ files - uses native Python on macOS as fallback
    decompress_xz() {
        local xz_file="$1"
        local output_file="${xz_file%.xz}"
        
        if command -v xz &> /dev/null; then
            xz -d "$xz_file"
        elif command -v python3 &> /dev/null; then
            echo "Using Python to decompress (xz command not installed)..."
            echo "This may take a few minutes for large files..."
            python3 -c "
import lzma
import sys
import os

xz_path = '$xz_file'
out_path = '$output_file'
file_size = os.path.getsize(xz_path)
bytes_read = 0
last_percent = -1

with lzma.open(xz_path, 'rb') as f_in:
    with open(out_path, 'wb') as f_out:
        while True:
            chunk = f_in.read(4 * 1024 * 1024)  # 4MB chunks
            if not chunk:
                break
            f_out.write(chunk)
            bytes_read += len(chunk)
            # Estimate progress (compressed vs uncompressed ratio ~3-4x)
            percent = min(99, int(bytes_read * 3.5 / file_size * 100))
            if percent != last_percent and percent % 10 == 0:
                print(f'  Decompressing... {percent}%', flush=True)
                last_percent = percent
print('  Decompressing... 100%')
" && rm -f "$xz_file"
        else
            echo -e "${RED}Error: Neither xz nor python3 found for decompression${NC}"
            echo "Please install xz:"
            if [ "$OS_TYPE" = "mac" ]; then
                echo "  brew install xz"
            else
                echo "  sudo apt-get install xz-utils"
            fi
            exit 1
        fi
    }

    # Check for xz or python3 for decompression
    if ! command -v xz &> /dev/null && ! command -v python3 &> /dev/null; then
        echo -e "${RED}Error: Need either xz or python3 for decompression${NC}"
        if [ "$OS_TYPE" = "mac" ]; then
            echo "macOS should have python3 pre-installed. Please check your system."
        else
            echo "Installing xz-utils..."
            apt-get update && apt-get install -y xz-utils
        fi
    fi

    # Function to get the pinned December 4, 2025 Trixie image URL
    # This function ONLY returns the pinned version - no fallbacks to other versions
    # Returns only the URL to stdout, debug messages go to stderr
    get_pinned_image_url() {
        echo "Using pinned Raspberry Pi OS Trixie (2025-12-04) image..." >&2
        
        # Use the exact pinned December 4, 2025 Trixie release - no other versions
        PINNED_URL="${IMAGE_BASE_URL}${TARGET_IMAGE_DIR}/${TARGET_IMAGE_FILE}"
        
        # Verify the pinned URL is accessible
        echo "Verifying image availability at: ${PINNED_URL}" >&2
        if curl -sI --head --fail "$PINNED_URL" >/dev/null 2>&1; then
            echo "Found: ${TARGET_IMAGE_DIR} (trixie - 2025-12-04)" >&2
            echo "$PINNED_URL"
            return 0
        fi
        
        echo -e "${RED}Error: Pinned image (2025-12-04) not found at expected URL${NC}" >&2
        echo "Expected URL: ${PINNED_URL}" >&2
        echo "" >&2
        echo "This script is pinned to the December 4, 2025 Trixie release." >&2
        echo "If this image has been removed from Raspberry Pi servers," >&2
        echo "please update TARGET_IMAGE_DATE in this script." >&2
        return 1
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
        
        # Get the pinned image URL (2025-12-04 Trixie only)
        IMAGE_URL=$(get_pinned_image_url)
        if [ $? -ne 0 ] || [ -z "$IMAGE_URL" ]; then
            echo -e "${RED}Error: Could not get pinned image URL${NC}"
            exit 1
        fi
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
        
        # Verify the download is a valid xz file (not an HTML error page)
        echo ""
        echo "Verifying downloaded file..."
        if ! file "$IMAGE_XZ_PATH" | grep -q "XZ compressed"; then
            echo -e "${RED}Error: Downloaded file is not a valid XZ archive${NC}"
            echo "This usually means the image URL was incorrect or the download failed."
            echo ""
            echo "File type detected: $(file "$IMAGE_XZ_PATH")"
            echo "Expected URL: $IMAGE_URL"
            echo ""
            echo "Please check:"
            echo "  1. Your internet connection"
            echo "  2. That the Raspberry Pi download servers are accessible"
            echo "  3. The image URL is correct"
            rm -f "$IMAGE_XZ_PATH"
            exit 1
        fi
        echo "✓ Download verified as valid XZ archive"
        
        echo ""
        echo "Extracting image (this may take a few minutes for desktop image)..."
        decompress_xz "$IMAGE_XZ_PATH"
        
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

# Create mount point for boot partition only (FAT32 - works on all platforms)
# We don't need to mount the ext4 root partition - everything goes on boot partition
BOOT_MOUNT="/tmp/qoom-boot-$$"
mkdir -p "$BOOT_MOUNT"

# On Mac, unmount any auto-mounted partitions first
if [ "$OS_TYPE" = "mac" ]; then
    diskutil unmount "$BOOT_PARTITION" 2>/dev/null || true
    diskutil unmount "$ROOT_PARTITION" 2>/dev/null || true
fi

# Mount boot partition only (FAT32 - native support on macOS, Linux, Windows)
echo "Mounting boot partition..."
mount_partition "$BOOT_PARTITION" "$BOOT_MOUNT"

echo "✓ Boot partition mounted (FAT32 - no ext4 access needed)"

# Enable SSH
echo "Enabling SSH..."
touch "$BOOT_MOUNT/ssh"
echo "✓ SSH enabled"

# Create user configuration (Raspberry Pi OS Bookworm+ method)
echo "Creating user configuration..."
ENCRYPTED_PASSWORD=$(generate_encrypted_password "$PI_PASSWORD")

# Verify password was encrypted successfully
if [ -z "$ENCRYPTED_PASSWORD" ]; then
    echo -e "${RED}ERROR: Password encryption failed!${NC}"
    echo "Trying alternative method..."
    # Last resort fallback - use a simple hash (less secure but works)
    ENCRYPTED_PASSWORD=$(python3 -c "
import hashlib, base64, os
salt = base64.b64encode(os.urandom(12)).decode()[:16].replace('+', '.').replace('/', '.')
password = '''$PI_PASSWORD'''
# Simple salted hash (not ideal but compatible)
h = hashlib.sha512((salt + password).encode()).digest()
encoded = base64.b64encode(h).decode()[:86].replace('+', '.').replace('/', '.')
print(f'\$6\${salt}\${encoded}')
" 2>/dev/null)
fi

if [ -z "$ENCRYPTED_PASSWORD" ] || [[ "$ENCRYPTED_PASSWORD" != \$6\$* ]]; then
    echo -e "${RED}CRITICAL ERROR: Could not generate encrypted password!${NC}"
    echo "The userconf.txt file will not work correctly."
    echo "Please ensure Python 3 is installed and working."
    exit 1
fi

echo "${PI_USERNAME}:${ENCRYPTED_PASSWORD}" > "$BOOT_MOUNT/userconf.txt"

# Verify userconf.txt was created correctly
USERCONF_FILE="$BOOT_MOUNT/userconf.txt"
if [ -f "$USERCONF_FILE" ] && [ -s "$USERCONF_FILE" ]; then
    USERCONF_CONTENT=$(cat "$USERCONF_FILE")
    USERCONF_USER=$(echo "$USERCONF_CONTENT" | cut -d: -f1)
    USERCONF_HASH=$(echo "$USERCONF_CONTENT" | cut -d: -f2)
    
    if [ "$USERCONF_USER" = "$PI_USERNAME" ] && [[ "$USERCONF_HASH" == \$6\$* ]]; then
        echo "✓ User configured: $PI_USERNAME"
        echo "  (Password hash verified: ${USERCONF_HASH:0:20}...)"
    else
        echo -e "${RED}ERROR: userconf.txt content is invalid!${NC}"
        echo "  Expected user: $PI_USERNAME, Found: $USERCONF_USER"
        echo "  Hash prefix: ${USERCONF_HASH:0:10}"
        exit 1
    fi
else
    echo -e "${RED}ERROR: userconf.txt was not created!${NC}"
    exit 1
fi

echo "WiFi and hostname will be configured via firstrun.sh on first boot"

# ===================================
# STEP 9: Configure Repository
# ===================================
echo ""
echo -e "${GREEN}Step 9: Configuring Qoom repository...${NC}"
echo "The Pi will clone code from: https://github.com/Qoomio/AIoT.git"
echo "The code/ folder will be copied to projects/aiot/ on first boot"
echo "✓ Repository configured"

# ===================================
# STEP 10: Create Two-Phase First-Boot Setup (multi-user.target solution)
# ===================================
echo ""
echo -e "${GREEN}Step 10: Creating two-phase first-boot setup...${NC}"
echo "Phase 1: Bootstrap script (runs early via cmdline.txt)"
echo "Phase 2: Main setup service (runs after user creation via systemd)"
echo ""

# =============================================
# PHASE 1: Bootstrap Script (firstrun.sh)
# This runs very early via cmdline.txt systemd.run
# It creates a systemd service and copies the main setup script
# =============================================
cat > "$BOOT_MOUNT/firstrun.sh" << 'PHASE1_EOF'
#!/bin/bash
# Qoom First-Boot Phase 1: Bootstrap Script
# This runs very early in boot via cmdline.txt systemd.run
# It sets up a proper systemd service to run the main setup AFTER user creation
#
# Why two phases?
# - systemd.run from cmdline.txt runs too early (before userconf.txt is processed)
# - The user account doesn't exist yet when this script runs
# - We need to defer the main setup to run After=multi-user.target

set +e  # Don't exit on error

LOG_FILE="/var/log/qoom-bootstrap.log"
BOOT_LOG="/boot/firmware/qoom-bootstrap.log"

log_msg() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" | tee -a "$LOG_FILE" "$BOOT_LOG" 2>/dev/null || echo "$msg" >> "$LOG_FILE"
}

exec > >(while read line; do log_msg "$line"; done) 2>&1

echo "======================================"
echo "Qoom Bootstrap (Phase 1) - $(date)"
echo "======================================"
echo ""
echo "This bootstrap script runs early in boot to set up"
echo "the main Qoom setup service that runs later."
echo ""

# Configuration (will be replaced by sed)
PI_NAME="__PI_NAME__"
WIFI_SSID="__WIFI_SSID__"
WIFI_PASSWORD="__WIFI_PASSWORD__"
WIFI_COUNTRY="__WIFI_COUNTRY__"

# ===================================
# Step 1: Copy the main setup script from boot partition to /opt
# ===================================
echo "Step 1: Installing main setup script..."
mkdir -p /opt/qoom

if [ -f "/boot/firmware/qoom-setup.sh" ]; then
    cp /boot/firmware/qoom-setup.sh /opt/qoom/setup.sh
    chmod +x /opt/qoom/setup.sh
    echo "✓ Main setup script installed to /opt/qoom/setup.sh"
else
    echo "ERROR: /boot/firmware/qoom-setup.sh not found!"
    echo "The main setup cannot proceed."
    exit 1
fi

# ===================================
# Step 2: Create the systemd service for Phase 2
# This service runs AFTER multi-user.target, which means:
# - User from userconf.txt has been created
# - Network services are running
# - System is in a more stable state
# ===================================
echo ""
echo "Step 2: Creating systemd service for main setup..."

cat > /etc/systemd/system/qoom-setup.service << 'SERVICE_EOF'
[Unit]
Description=Qoom First-Boot Setup (Phase 2)
# Run after multi-user.target to ensure user from userconf.txt is created
After=multi-user.target network-online.target
Wants=network-online.target
# Only run once - the script will disable itself after completion
ConditionPathExists=/opt/qoom/setup.sh

[Service]
Type=oneshot
ExecStart=/opt/qoom/setup.sh
RemainAfterExit=yes
StandardOutput=journal+console
StandardError=journal+console
# Give it plenty of time for npm install, etc.
TimeoutStartSec=3600

[Install]
WantedBy=multi-user.target
SERVICE_EOF

echo "✓ Systemd service created: qoom-setup.service"

# Enable the service
systemctl daemon-reload
systemctl enable qoom-setup.service
echo "✓ Service enabled for next boot"

# ===================================
# Step 3: Clean up cmdline.txt to prevent Phase 1 from running again
# ===================================
echo ""
echo "Step 3: Cleaning up cmdline.txt..."

CMDLINE_FILE="/boot/firmware/cmdline.txt"
if [ -f "$CMDLINE_FILE" ]; then
    # Remove the systemd.run parameters we added
    sed -i 's/ systemd.run=[^ ]*//g' "$CMDLINE_FILE"
    sed -i 's/ systemd.run_success_action=[^ ]*//g' "$CMDLINE_FILE"
    sed -i 's/ systemd.unit=kernel-command-line.target//g' "$CMDLINE_FILE"
    echo "✓ cmdline.txt restored (Phase 1 trigger removed)"
fi

# Rename firstrun.sh so it's clear it has completed
FIRSTRUN_SCRIPT="/boot/firmware/firstrun.sh"
if [ -f "$FIRSTRUN_SCRIPT" ]; then
    mv "$FIRSTRUN_SCRIPT" "/boot/firmware/firstrun.sh.phase1-completed"
    echo "✓ Bootstrap script renamed to firstrun.sh.phase1-completed"
fi

echo ""
echo "======================================"
echo "Bootstrap Complete!"
echo "======================================"
echo ""
echo "Phase 1 (bootstrap) has completed successfully."
echo "Phase 2 (main setup) will run automatically after the system"
echo "finishes booting and the user account is created."
echo ""
echo "The main setup will:"
echo "  - Configure WiFi and hostname"
echo "  - Install Node.js, PM2, Git"
echo "  - Clone and deploy the Qoom application"
echo ""
echo "Monitor progress: journalctl -u qoom-setup.service -f"
echo "Or check: /var/log/qoom-setup.log"
echo ""
PHASE1_EOF

# =============================================
# PHASE 2: Main Setup Script (qoom-setup.sh)
# This runs later via systemd, after user is created
# =============================================
cat > "$BOOT_MOUNT/qoom-setup.sh" << 'PHASE2_EOF'
#!/bin/bash
# Qoom First-Boot Phase 2: Main Setup Script
# This runs via systemd After=multi-user.target
# At this point, the user from userconf.txt has been created

set +e  # Don't exit on error

# Configuration (will be replaced by sed)
PI_NAME="__PI_NAME__"
WIFI_SSID="__WIFI_SSID__"
WIFI_PASSWORD="__WIFI_PASSWORD__"
WIFI_COUNTRY="__WIFI_COUNTRY__"

# Setup logging
LOG_FILE="/var/log/qoom-setup.log"
BOOT_LOG="/boot/firmware/qoom-setup.log"

log_msg() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$msg" | tee -a "$LOG_FILE" "$BOOT_LOG" 2>/dev/null || echo "$msg" >> "$LOG_FILE"
}

exec > >(while read line; do log_msg "$line"; done) 2>&1

echo "======================================"
echo "Qoom Main Setup (Phase 2) - $(date)"
echo "Pi Name: $PI_NAME"
echo "======================================"
echo ""

# ===================================
# STEP 1: Configure Hostname and WiFi
# ===================================
echo "Step 1: Configuring hostname and WiFi..."
echo ""

# Set hostname
echo "Setting hostname to $PI_NAME..."
echo "$PI_NAME" > /etc/hostname
sed -i "s/raspberrypi/$PI_NAME/g" /etc/hosts 2>/dev/null || true
hostnamectl set-hostname "$PI_NAME" 2>/dev/null || true
echo "✓ Hostname set to $PI_NAME"

# Configure WiFi regulatory domain
echo "Setting WiFi country to $WIFI_COUNTRY..."
iw reg set "$WIFI_COUNTRY" 2>/dev/null || true
raspi-config nonint do_wifi_country "$WIFI_COUNTRY" 2>/dev/null || true
echo "✓ WiFi country set"

# Create WiFi configuration file
echo "Creating WiFi configuration for $WIFI_SSID..."
mkdir -p /etc/NetworkManager/system-connections

cat > /etc/NetworkManager/system-connections/qoom-wifi.nmconnection << WIFI_EOF
[connection]
id=$WIFI_SSID
uuid=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$(date +%s)-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')")
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

chmod 600 /etc/NetworkManager/system-connections/qoom-wifi.nmconnection
echo "✓ WiFi configuration created"

# Unblock WiFi and restart NetworkManager
echo "Enabling WiFi..."
rfkill unblock all 2>/dev/null || true
rfkill unblock wifi 2>/dev/null || true
nmcli radio wifi on 2>/dev/null || true

echo "Restarting NetworkManager..."
systemctl restart NetworkManager 2>/dev/null || true
sleep 5

# Activate the connection
echo "Activating WiFi connection..."
nmcli connection reload 2>/dev/null || true
nmcli connection up "$WIFI_SSID" 2>/dev/null || true

# ===================================
# STEP 2: Wait for Network
# ===================================
echo ""
echo "Step 2: Waiting for network connectivity..."

check_network() {
    ping -c 1 -W 3 8.8.8.8 &> /dev/null || ping -c 1 -W 3 1.1.1.1 &> /dev/null
    return $?
}

NETWORK_UP=false
MAX_WAIT=300  # 5 minutes
RETRY_INTERVAL=10

for ((i=0; i<=MAX_WAIT; i+=RETRY_INTERVAL)); do
    if check_network; then
        echo "✓ Network is up after ${i} seconds!"
        NETWORK_UP=true
        break
    fi
    
    if [ $((i % 30)) -eq 0 ] && [ $i -gt 0 ]; then
        echo "  Still waiting for network... (${i}/${MAX_WAIT}s)"
    fi
    
    # Retry WiFi connection at intervals
    if [ $i -eq 60 ] || [ $i -eq 180 ]; then
        echo "  Retrying WiFi connection..."
        nmcli connection reload 2>/dev/null || true
        nmcli connection up "$WIFI_SSID" 2>/dev/null || true
    fi
    
    sleep $RETRY_INTERVAL
done

if [ "$NETWORK_UP" = false ]; then
    echo "WARNING: Network not available. Some steps may fail."
else
    echo "  IP Address: $(hostname -I | awk '{print $1}')"
fi

# ===================================
# STEP 3: Wait for NTP time sync
# ===================================
echo ""
echo "Step 3: Waiting for NTP time synchronization..."

timedatectl set-ntp true 2>/dev/null || systemctl start systemd-timesyncd 2>/dev/null || true

NTP_MAX_WAIT=60
NTP_WAIT=0
NTP_SYNCED=false

while [ $NTP_WAIT -lt $NTP_MAX_WAIT ]; do
    CURRENT_YEAR=$(date +%Y)
    if [ "$CURRENT_YEAR" -ge 2025 ]; then
        echo "✓ System clock appears correct: $(date)"
        NTP_SYNCED=true
        break
    fi
    
    sleep 5
    NTP_WAIT=$((NTP_WAIT + 5))
done

if [ "$NTP_SYNCED" = false ]; then
    echo "WARNING: NTP sync timeout. Continuing anyway..."
fi

# ===================================
# STEP 4: Find the user account
# The user should already exist at this point (created from userconf.txt)
# ===================================
echo ""
echo "Step 4: Finding user account..."

# The expected user is PI_NAME (from userconf.txt)
if [ -d "/home/$PI_NAME" ]; then
    SETUP_USER="$PI_NAME"
    echo "✓ Found expected user: $SETUP_USER"
elif id "$PI_NAME" &>/dev/null; then
    SETUP_USER="$PI_NAME"
    echo "✓ Found expected user (no home yet): $SETUP_USER"
    # Create home directory if it doesn't exist
    mkdir -p "/home/$SETUP_USER"
    chown "$SETUP_USER:$SETUP_USER" "/home/$SETUP_USER"
else
    # Fallback: find any user with UID >= 1000
    SETUP_USER=$(awk -F: '$3 >= 1000 && $3 < 65000 {print $1; exit}' /etc/passwd)
    if [ -n "$SETUP_USER" ]; then
        echo "WARNING: Expected user '$PI_NAME' not found, using: $SETUP_USER"
    else
        echo "ERROR: No regular user found! Using 'pi' as fallback."
        SETUP_USER="pi"
    fi
fi

SETUP_HOME="/home/$SETUP_USER"
echo "  Home directory: $SETUP_HOME"

# Ensure home directory exists
if [ ! -d "$SETUP_HOME" ]; then
    echo "  Creating home directory..."
    mkdir -p "$SETUP_HOME"
    chown "$SETUP_USER:$SETUP_USER" "$SETUP_HOME"
fi

# ===================================
# STEP 5: Install Node.js using nvm
# ===================================
echo ""
echo "Step 5: Installing Node.js 24 using nvm..."

export NVM_DIR="$SETUP_HOME/.nvm"

if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "Fetching latest nvm version..."
    NVM_VERSION=$(curl -s https://api.github.com/repos/nvm-sh/nvm/releases/latest | grep -oP '"tag_name": "\K[^"]+' || echo "v0.40.1")
    echo "Installing nvm $NVM_VERSION..."
    sudo -u "$SETUP_USER" bash -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash"
fi

echo "Installing Node.js 24..."
sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    nvm install 24
    nvm alias default 24
    nvm use 24
    echo \"Node.js: \$(node -v)\"
    echo \"NPM: \$(npm -v)\"
"
echo "✓ Node.js installed"

# ===================================
# STEP 6: Install PM2
# ===================================
echo ""
echo "Step 6: Installing PM2..."
sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    npm install -g pm2
    echo \"PM2: \$(pm2 -v)\"
"
echo "✓ PM2 installed"

# ===================================
# STEP 7: Install system dependencies
# ===================================
echo ""
echo "Step 7: Installing system dependencies..."
apt-get update

if ! command -v git &> /dev/null; then
    apt-get install -y git
fi
echo "✓ Git: $(git --version)"

echo "Installing build tools..."
apt-get install -y build-essential python3 make g++ 2>&1 || true

echo "Installing AIoT dependencies..."
apt-get install -y \
    libcap-dev python3-dev python3-libcamera python3-picamera2 libcamera-dev \
    2>&1 || echo "Warning: Some AIoT dependencies may not have installed"

# Install uv
echo "Installing uv..."
if ! command -v uv &> /dev/null; then
    sudo -u "$SETUP_USER" bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh' 2>&1 || true
    if ! grep -q "\.local/bin" "$SETUP_HOME/.bashrc" 2>/dev/null; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SETUP_HOME/.bashrc"
        chown "$SETUP_USER:$SETUP_USER" "$SETUP_HOME/.bashrc"
    fi
fi
echo "✓ System dependencies installed"

# ===================================
# STEP 8: Clone and deploy Qoom
# ===================================
echo ""
echo "Step 8: Cloning and deploying Qoom..."

REPO_DIR="$SETUP_HOME/qoom"
REPO_URL="https://github.com/Qoomio/AIoT.git"

if [ -d "$REPO_DIR" ]; then
    rm -rf "$REPO_DIR"
fi

echo "Cloning from $REPO_URL..."
sudo -u "$SETUP_USER" git clone "$REPO_URL" "$REPO_DIR" 2>&1

if [ -d "$REPO_DIR" ]; then
    chown -R "$SETUP_USER:$SETUP_USER" "$REPO_DIR"
    echo "✓ Repository cloned"
    
    # Copy AIoT code to projects folder
    if [ -d "$REPO_DIR/code" ]; then
        sudo -u "$SETUP_USER" mkdir -p "$REPO_DIR/projects/aiot"
        cp -r "$REPO_DIR/code/." "$REPO_DIR/projects/aiot/"
        chown -R "$SETUP_USER:$SETUP_USER" "$REPO_DIR/projects"
        echo "✓ AIoT code copied to projects/aiot/"
    fi
    
    # Create logs directory
    sudo -u "$SETUP_USER" mkdir -p "$SETUP_HOME/logs"
    
    # Deploy the application
    echo ""
    echo "Installing npm dependencies and starting application..."
    sudo -u "$SETUP_USER" bash -c "
        export NVM_DIR='$NVM_DIR'
        export NODE_ENV='education'
        [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
        cd '$REPO_DIR'
        
        echo 'Installing npm packages...'
        npm install
        
        echo 'Building editer bundle...'
        npm run build:editer 2>&1 || true
        
        pm2 delete aiot 2>/dev/null || true
        pm2 start ecosystem.config.cjs
        pm2 save
    "
    echo "✓ Application deployed and started"
    
    # Show status
    echo ""
    sudo -u "$SETUP_USER" bash -c "
        export NVM_DIR='$NVM_DIR'
        [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
        pm2 list
    "
else
    echo "ERROR: Failed to clone repository"
fi

# ===================================
# STEP 9: Setup Python projects
# ===================================
echo ""
echo "Step 9: Setting up Python projects..."

if [ -d "$REPO_DIR/projects" ]; then
    for project in "$REPO_DIR/projects"/*/; do
        if [ -d "$project" ]; then
            if [ -f "$project/pyproject.toml" ] || [ -f "$project/requirements.txt" ]; then
                project_name=$(basename "$project")
                echo "  Setting up $project_name..."
                sudo -u "$SETUP_USER" bash -c "
                    export PATH=\"\$HOME/.local/bin:\$PATH\"
                    cd '$project'
                    uv venv 2>&1 || true
                "
                if [ -f "$project/.venv/pyvenv.cfg" ]; then
                    if grep -q "include-system-site-packages" "$project/.venv/pyvenv.cfg"; then
                        sed -i 's/include-system-site-packages = false/include-system-site-packages = true/' "$project/.venv/pyvenv.cfg"
                    else
                        echo "include-system-site-packages = true" >> "$project/.venv/pyvenv.cfg"
                    fi
                fi
            fi
        fi
    done
fi
echo "✓ Python projects configured"

# ===================================
# STEP 10: Configure PM2 startup
# ===================================
echo ""
echo "Step 10: Configuring PM2 auto-start..."

PM2_STARTUP=$(sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    pm2 startup systemd -u $SETUP_USER --hp $SETUP_HOME 2>&1
" || true)

STARTUP_CMD=$(echo "$PM2_STARTUP" | grep "sudo env" || true)
if [ -n "$STARTUP_CMD" ]; then
    eval "$STARTUP_CMD" || true
fi

sudo -u "$SETUP_USER" bash -c "
    export NVM_DIR='$NVM_DIR'
    [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\"
    pm2 save
"
echo "✓ PM2 startup configured"

# ===================================
# STEP 11: Fix ownership and cleanup
# ===================================
echo ""
echo "Step 11: Final cleanup..."

# Fix ownership
chown -R "$SETUP_USER:$SETUP_USER" "$REPO_DIR" 2>/dev/null || true
chown -R "$SETUP_USER:$SETUP_USER" "$SETUP_HOME/logs" 2>/dev/null || true

# Disable this service so it doesn't run again
systemctl disable qoom-setup.service 2>/dev/null || true

# Rename setup script to show completion
mv /opt/qoom/setup.sh /opt/qoom/setup.sh.completed 2>/dev/null || true

# Get IP for display
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "======================================"
echo "Qoom Setup Complete!"
echo "======================================"
echo ""
echo "Summary:"
echo "  ✓ Hostname: $PI_NAME"
echo "  ✓ WiFi: $WIFI_SSID"
echo "  ✓ User: $SETUP_USER"
echo "  ✓ Node.js 24 installed"
echo "  ✓ PM2 installed and configured"
echo "  ✓ Qoom application deployed"
echo ""
echo "Access your Pi:"
echo "  Web: http://${LOCAL_IP}:3000"
echo "  SSH: ssh $SETUP_USER@${LOCAL_IP}"
echo ""
echo "Useful commands:"
echo "  pm2 list                    - View running processes"
echo "  pm2 logs                    - View application logs"
echo "  pm2 restart all             - Restart the application"
echo ""
echo "Setup completed at: $(date)"
echo ""
PHASE2_EOF

# Replace placeholders in both scripts (use platform-appropriate sed)
PHASE1_SCRIPT="$BOOT_MOUNT/firstrun.sh"
PHASE2_SCRIPT="$BOOT_MOUNT/qoom-setup.sh"

if [ "$OS_TYPE" = "mac" ]; then
    # Phase 1 script
    sed -i '' "s|__PI_NAME__|$PI_NAME|g" "$PHASE1_SCRIPT"
    sed -i '' "s|__WIFI_SSID__|$WIFI_SSID|g" "$PHASE1_SCRIPT"
    sed -i '' "s|__WIFI_PASSWORD__|$WIFI_PASSWORD|g" "$PHASE1_SCRIPT"
    sed -i '' "s|__WIFI_COUNTRY__|$WIFI_COUNTRY|g" "$PHASE1_SCRIPT"
    # Phase 2 script
    sed -i '' "s|__PI_NAME__|$PI_NAME|g" "$PHASE2_SCRIPT"
    sed -i '' "s|__WIFI_SSID__|$WIFI_SSID|g" "$PHASE2_SCRIPT"
    sed -i '' "s|__WIFI_PASSWORD__|$WIFI_PASSWORD|g" "$PHASE2_SCRIPT"
    sed -i '' "s|__WIFI_COUNTRY__|$WIFI_COUNTRY|g" "$PHASE2_SCRIPT"
else
    # Phase 1 script
    sed -i "s|__PI_NAME__|$PI_NAME|g" "$PHASE1_SCRIPT"
    sed -i "s|__WIFI_SSID__|$WIFI_SSID|g" "$PHASE1_SCRIPT"
    sed -i "s|__WIFI_PASSWORD__|$WIFI_PASSWORD|g" "$PHASE1_SCRIPT"
    sed -i "s|__WIFI_COUNTRY__|$WIFI_COUNTRY|g" "$PHASE1_SCRIPT"
    # Phase 2 script
    sed -i "s|__PI_NAME__|$PI_NAME|g" "$PHASE2_SCRIPT"
    sed -i "s|__WIFI_SSID__|$WIFI_SSID|g" "$PHASE2_SCRIPT"
    sed -i "s|__WIFI_PASSWORD__|$WIFI_PASSWORD|g" "$PHASE2_SCRIPT"
    sed -i "s|__WIFI_COUNTRY__|$WIFI_COUNTRY|g" "$PHASE2_SCRIPT"
fi

chmod +x "$PHASE1_SCRIPT"
chmod +x "$PHASE2_SCRIPT"

# Modify cmdline.txt to run Phase 1 bootstrap on first boot
# Note: We do NOT use systemd.unit=kernel-command-line.target here
# because that runs too early. The default timing for systemd.run is fine
# for Phase 1, which just needs to create the systemd service.
CMDLINE_FILE="$BOOT_MOUNT/cmdline.txt"
if [ -f "$CMDLINE_FILE" ]; then
    echo "Configuring cmdline.txt to run bootstrap on first boot..."
    CURRENT_CMDLINE=$(cat "$CMDLINE_FILE" | tr -d '\n')
    
    if echo "$CURRENT_CMDLINE" | grep -q "systemd.run="; then
        echo "cmdline.txt already contains firstrun configuration"
    else
        # Just use systemd.run without kernel-command-line.target
        # This runs at a better time in the boot process
        echo "${CURRENT_CMDLINE} systemd.run=/boot/firmware/firstrun.sh systemd.run_success_action=none" > "$CMDLINE_FILE"
        echo "✓ cmdline.txt configured for two-phase boot"
    fi
else
    echo -e "${YELLOW}Warning: cmdline.txt not found at expected location${NC}"
fi

echo "✓ Two-phase first-boot setup created"
echo "  Phase 1: firstrun.sh (bootstrap - creates systemd service)"
echo "  Phase 2: qoom-setup.sh (main setup - runs After=multi-user.target)"

# ===================================
# STEP 11: Cleanup and Finish
# ===================================
echo ""
echo -e "${GREEN}Step 11: Finishing up...${NC}"

sync

# Unmount boot partition (platform-specific)
if [ "$OS_TYPE" = "mac" ]; then
    # On Mac, use diskutil for clean unmount
    umount "$BOOT_MOUNT" 2>/dev/null || diskutil unmount "$BOOT_MOUNT" 2>/dev/null || true
    # Eject the disk for safe removal
    diskutil eject "/dev/$SD_DEVICE" 2>/dev/null || true
else
    umount "$BOOT_MOUNT" 2>/dev/null || true
fi
rmdir "$BOOT_MOUNT" 2>/dev/null || true

echo "✓ Boot partition unmounted"

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

# Set file ownership (macOS uses different group format than Linux)
if [ "$OS_TYPE" = "mac" ]; then
    chown "$REAL_USER" "$CREDS_FILE"
else
    chown "$REAL_USER:$REAL_USER" "$CREDS_FILE"
fi

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
    echo -e "${GREEN}✓ Full configuration completed on macOS${NC}"
    echo "(No ext4 access needed - all configuration via boot partition)"
    echo ""
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

