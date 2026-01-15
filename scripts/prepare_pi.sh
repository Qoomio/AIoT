#!/bin/bash

# Qoom Kit - Raspberry Pi Preparation Script (Cloud-Init Version)
# This script prepares an SD card with Raspberry Pi OS configured for Qoom
#
# SUPPORTED PLATFORMS:
#   - Linux (full support)
#   - macOS (full support - only needs FAT32 boot partition access)
#   - Windows (via WSL - Windows Subsystem for Linux)
#
# IMAGE: Raspberry Pi OS (64-bit) with Desktop - Debian Trixie (December 2025 release)
#
# SUPPORTED MODELS:
#   - Raspberry Pi 5 (all variants)
#   - Raspberry Pi 4 (all variants)
#   - Raspberry Pi 3 (64-bit capable models)
#   - Any Pi that supports arm64 and Raspberry Pi OS Trixie
#
# USAGE:
#   sudo ./prepare_pi_cloud.sh
#
# This script will:
#   1. Detect and verify SD card
#   2. Download Raspberry Pi OS (if not cached)
#   3. Image the SD card
#   4. Configure via cloud-init (user-data, network-config)
#
# After first boot, the Pi will automatically:
#   - Create user with password
#   - Connect to WiFi
#   - Enable SSH
#   - Install Node.js, PM2, Git
#   - Clone and start the Qoom application

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ===================================
# OS Detection
# ===================================
OS_TYPE="unknown"
IS_WSL=false

if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="mac"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    if grep -qEi "(Microsoft|WSL)" /proc/version 2>/dev/null; then
        IS_WSL=true
        OS_TYPE="wsl"
    else
        OS_TYPE="linux"
    fi
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    echo -e "${RED}Error: Native Windows shells are not supported. Use WSL.${NC}"
    exit 1
else
    echo -e "${RED}Error: Unsupported operating system: $OSTYPE${NC}"
    exit 1
fi

echo -e "${BLUE}Detected OS: ${OS_TYPE}${NC}"
echo ""

# ===================================
# Platform-Specific Functions
# ===================================

list_block_devices() {
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Available disks:"
        echo ""
        diskutil list | grep -E "^/dev/disk|external|internal" | head -20
    elif [ "$OS_TYPE" = "wsl" ]; then
        echo "Available block devices (via WSL):"
        echo ""
        lsblk -d -o NAME,SIZE,TYPE,MODEL,TRAN 2>/dev/null | grep -v "loop" | grep -v "^NAME" || \
        ls -la /dev/sd* 2>/dev/null | grep -E "sd[a-z]$" || \
        echo "No block devices found."
    else
        echo "Available block devices:"
        echo ""
        lsblk -d -o NAME,SIZE,TYPE,MODEL,TRAN | grep -v "loop" | grep -v "^NAME"
    fi
}

detect_sd_cards() {
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil list external | grep -oE "/dev/disk[0-9]+" | sed 's|/dev/||' | sort -u || true
    elif [ "$OS_TYPE" = "wsl" ]; then
        lsblk -d -n -o NAME,RM 2>/dev/null | awk '$2=="1" {print $1}' || \
        lsblk -d -n -o NAME,TRAN 2>/dev/null | grep -E "usb|mmc" | awk '{print $1}' || true
    else
        lsblk -d -n -o NAME,TRAN | grep -E "usb|mmc" | awk '{print $1}' || true
    fi
}

get_device_size() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil info "/dev/$device" 2>/dev/null | grep "Disk Size" | awk -F: '{print $2}' | awk '{print $1, $2}' | xargs || echo "Unknown"
    else
        lsblk -d -n -o SIZE "/dev/$device" 2>/dev/null || echo "Unknown"
    fi
}

get_device_model() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil info "/dev/$device" 2>/dev/null | grep "Device / Media Name" | awk -F: '{print $2}' | xargs || echo "Unknown"
    else
        lsblk -d -n -o MODEL "/dev/$device" 2>/dev/null || echo "Unknown"
    fi
}

device_exists() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil info "/dev/$device" &>/dev/null
    else
        [ -b "/dev/$device" ]
    fi
}

unmount_device() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Unmounting all volumes on /dev/$device..."
        diskutil unmountDisk force "/dev/$device" 2>/dev/null || true
        sleep 2  # Give the system time to fully release the device
    else
        echo "Unmounting any mounted partitions..."
        for partition in /dev/${device}*; do
            if mount | grep -q "$partition"; then
                umount "$partition" 2>/dev/null || true
            fi
        done
        if [[ "$device" == mmcblk* ]]; then
            for partition in /dev/${device}p*; do
                if mount | grep -q "$partition"; then
                    umount "$partition" 2>/dev/null || true
                fi
            done
        fi
    fi
}

wipe_disk() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Erasing disk /dev/$device..."
        # Force unmount first to avoid "Resource busy" errors
        diskutil unmountDisk force "/dev/$device" 2>/dev/null || true
        sleep 1
        diskutil eraseDisk FAT32 TEMP_DISK MBRFormat "/dev/$device" || {
            echo -e "${YELLOW}Warning: diskutil erase failed, trying dd...${NC}"
            diskutil unmountDisk force "/dev/$device" 2>/dev/null || true
            dd if=/dev/zero of="/dev/r${device}" bs=1m count=100 2>/dev/null || true
        }
    else
        echo "Wiping partition table..."
        wipefs -a "/dev/$device"
    fi
}

write_image() {
    local image_path="$1"
    local device="$2"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Writing image to /dev/r${device} (raw device for speed)..."
        
        local max_attempts=60  # 10 minutes (60 attempts * 10 seconds)
        local attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            # Try to write the image
            if dd if="$image_path" of="/dev/r${device}" bs=4m status=progress conv=sync 2>/tmp/dd_error_$$; then
                echo "Image write successful!"
                rm -f /tmp/dd_error_$$
                return 0
            fi
            
            # Check if it's a "Resource busy" error
            if grep -q "Resource busy" /tmp/dd_error_$$ 2>/dev/null; then
                echo ""
                echo -e "${YELLOW}Disk busy (attempt $attempt/$max_attempts). Trying to release...${NC}"
                
                # Escalating strategies to release the disk
                echo "  Forcing unmount..."
                diskutil unmountDisk force "/dev/$device" 2>/dev/null || true
                sleep 2
                
                if [ $attempt -ge 3 ]; then
                    echo "  Stopping Spotlight indexing..."
                    mdutil -i off "/Volumes/"* 2>/dev/null || true
                    killall mds mds_stores 2>/dev/null || true
                    sleep 2
                fi
                
                if [ $attempt -ge 6 ]; then
                    echo "  Trying hdiutil detach..."
                    hdiutil detach "/dev/$device" -force 2>/dev/null || true
                    sleep 2
                fi
                
                if [ $attempt -ge 10 ]; then
                    echo "  Ejecting and waiting..."
                    diskutil eject "/dev/$device" 2>/dev/null || true
                    echo -e "${YELLOW}  Please re-insert the SD card and press Enter...${NC}"
                    read -r
                    sleep 3
                fi
                
                attempt=$((attempt + 1))
                sleep 10
            else
                # Different error, show it and fail
                echo -e "${RED}Error writing image:${NC}"
                cat /tmp/dd_error_$$
                rm -f /tmp/dd_error_$$
                return 1
            fi
        done
        
        echo -e "${RED}Failed to write image after 10 minutes of retrying.${NC}"
        echo "The disk appears to be persistently busy."
        echo "Try: 1) Ejecting the SD card  2) Re-inserting it  3) Running the script immediately"
        rm -f /tmp/dd_error_$$
        return 1
    else
        dd if="$image_path" of="/dev/$device" bs=4M status=progress conv=fsync
    fi
}

refresh_partitions() {
    local device="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        echo "Refreshing disk..."
        diskutil unmountDisk force "/dev/$device" 2>/dev/null || true
        sleep 2
    else
        echo "Re-reading partition table..."
        blockdev --rereadpt "/dev/$device" 2>/dev/null || true
        partprobe "/dev/$device" 2>/dev/null || true
        udevadm settle --timeout=10 2>/dev/null || sleep 3
    fi
}

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

wait_for_partition() {
    local partition="$1"
    local max_wait="${2:-30}"
    local wait_count=0
    
    echo "Waiting for partition $partition to appear..."
    
    while [ $wait_count -lt $max_wait ]; do
        if [ "$OS_TYPE" = "mac" ]; then
            [ -e "$partition" ] && return 0
        else
            [ -b "$partition" ] && return 0
        fi
        sleep 1
        wait_count=$((wait_count + 1))
    done
    
    return 1
}

mount_boot_partition() {
    local partition="$1"
    local mount_point="$2"
    
    mkdir -p "$mount_point"
    
    if [ "$OS_TYPE" = "mac" ]; then
        diskutil unmount "$partition" 2>/dev/null || true
        mount -t msdos "$partition" "$mount_point" 2>/dev/null || \
        mount -t exfat "$partition" "$mount_point" 2>/dev/null || \
        mount "$partition" "$mount_point"
    else
        mount "$partition" "$mount_point"
    fi
}

get_real_home() {
    local user="$1"
    if [ "$OS_TYPE" = "mac" ]; then
        dscl . -read "/Users/$user" NFSHomeDirectory 2>/dev/null | awk '{print $2}' || echo "/Users/$user"
    else
        getent passwd "$user" | cut -d: -f6
    fi
}

# ===================================
# Configuration
# ===================================
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(get_real_home "$REAL_USER")
CACHE_DIR="$REAL_HOME/.cache/qoom-pi-images"

# Image configuration - December 2025 Trixie release
IMAGE_BASE_URL="https://downloads.raspberrypi.com/raspios_arm64/images/"
TARGET_IMAGE_DATE="2025-12-04"
TARGET_IMAGE_DIR="raspios_arm64-${TARGET_IMAGE_DATE}"
TARGET_IMAGE_FILE="${TARGET_IMAGE_DATE}-raspios-trixie-arm64.img.xz"

# ===================================
# Main Script
# ===================================

echo -e "${BLUE}=============================================${NC}"
echo -e "${BLUE}Qoom Kit - Raspberry Pi Preparation${NC}"
echo -e "${BLUE}(Cloud-Init Version)${NC}"
echo -e "${BLUE}=============================================${NC}"
echo ""
echo "This script prepares an SD card for the Qoom platform using cloud-init."
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (sudo)${NC}"
    echo "Usage: sudo $0"
    exit 1
fi

# ===================================
# STEP 1: Get User Configuration
# ===================================
echo -e "${GREEN}Step 1: Configuration${NC}"
echo ""

# Username
read -p "Enter username: " PI_USERNAME
if [ -z "$PI_USERNAME" ]; then
    echo -e "${RED}Error: Username is required${NC}"
    exit 1
fi
# Username is also the hostname
PI_HOSTNAME="$PI_USERNAME"

# Password
read -p "Enter password: " PI_PASSWORD
if [ -z "$PI_PASSWORD" ]; then
    echo -e "${RED}Error: Password is required${NC}"
    exit 1
fi

# WiFi SSID
read -p "Enter WiFi SSID (network name): " WIFI_SSID
if [ -z "$WIFI_SSID" ]; then
    echo -e "${RED}Error: WiFi SSID is required${NC}"
    exit 1
fi

# WiFi Password
read -p "Enter WiFi password: " WIFI_PASSWORD
if [ -z "$WIFI_PASSWORD" ]; then
    echo -e "${RED}Error: WiFi password is required${NC}"
    exit 1
fi

# WiFi Country
read -p "Enter WiFi country code (e.g., US, GB, KR, JP) [US]: " WIFI_COUNTRY
WIFI_COUNTRY="${WIFI_COUNTRY:-US}"

# Keyboard Layout
read -p "Enter keyboard layout (e.g., us, gb, de, kr) [us]: " KEYBOARD_LAYOUT
KEYBOARD_LAYOUT="${KEYBOARD_LAYOUT:-us}"

echo ""
echo -e "${BLUE}Configuration Summary:${NC}"
echo "  Username/Hostname: $PI_USERNAME"
echo "  Password: $PI_PASSWORD"
echo "  WiFi SSID: $WIFI_SSID"
echo "  WiFi Country: $WIFI_COUNTRY"
echo "  Keyboard: $KEYBOARD_LAYOUT"
echo ""

read -p "Is this correct? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
    echo "Setup cancelled."
    exit 1
fi

# ===================================
# STEP 2: Detect SD Card
# ===================================
echo ""
echo -e "${GREEN}Step 2: Detecting SD card...${NC}"
echo ""

list_block_devices
echo ""

SD_CARDS=$(detect_sd_cards)
if [ -n "$SD_CARDS" ]; then
    echo "Detected potential SD cards: $SD_CARDS"
fi
echo ""

if [ "$OS_TYPE" = "mac" ]; then
    read -p "Enter the SD card device name (e.g., disk2, disk3): " SD_DEVICE
else
    read -p "Enter the SD card device name (e.g., sdb, mmcblk0): " SD_DEVICE
fi

if ! device_exists "$SD_DEVICE"; then
    echo -e "${RED}Error: /dev/$SD_DEVICE does not exist${NC}"
    exit 1
fi

DEVICE_SIZE=$(get_device_size "$SD_DEVICE")
DEVICE_MODEL=$(get_device_model "$SD_DEVICE")

echo ""
echo "Selected device:"
echo -e "  Device: ${BLUE}/dev/$SD_DEVICE${NC}"
echo -e "  Size: $DEVICE_SIZE"
echo -e "  Model: $DEVICE_MODEL"
echo ""
echo -e "${RED}WARNING: ALL DATA ON THIS DEVICE WILL BE ERASED!${NC}"
read -p "Type 'YES' to confirm: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
    echo "Operation cancelled."
    exit 1
fi

# ===================================
# STEP 3: Download Raspberry Pi OS
# ===================================
echo ""
echo -e "${GREEN}Step 3: Downloading Raspberry Pi OS...${NC}"
echo ""
echo "Image: Raspberry Pi OS (64-bit) with Desktop - Trixie"
echo "Date: ${TARGET_IMAGE_DATE}"
echo ""

mkdir -p "$CACHE_DIR"

IMAGE_URL="${IMAGE_BASE_URL}${TARGET_IMAGE_DIR}/${TARGET_IMAGE_FILE}"
IMAGE_XZ_PATH="$CACHE_DIR/$TARGET_IMAGE_FILE"
IMAGE_PATH="${IMAGE_XZ_PATH%.xz}"

# Check for cached image
if [ -f "$IMAGE_PATH" ]; then
    echo "Using cached image: $IMAGE_PATH"
else
    echo "Downloading from: $IMAGE_URL"
    echo "This may take several minutes..."
    
    if command -v wget &> /dev/null; then
        wget --progress=bar:force -O "$IMAGE_XZ_PATH" "$IMAGE_URL"
    else
        curl -L --progress-bar -o "$IMAGE_XZ_PATH" "$IMAGE_URL"
    fi
    
    echo ""
    echo "Extracting image..."
    if command -v xz &> /dev/null; then
        xz -d "$IMAGE_XZ_PATH"
    elif command -v python3 &> /dev/null; then
        python3 -c "
import lzma
with lzma.open('$IMAGE_XZ_PATH', 'rb') as f_in:
    with open('$IMAGE_PATH', 'wb') as f_out:
        while chunk := f_in.read(4*1024*1024):
            f_out.write(chunk)
" && rm -f "$IMAGE_XZ_PATH"
    else
        echo -e "${RED}Error: Need xz or python3 for decompression${NC}"
        exit 1
    fi
    
    echo "Image downloaded and extracted."
fi

# ===================================
# STEP 4: Write Image to SD Card
# ===================================
echo ""
echo -e "${GREEN}Step 4: Writing image to SD card...${NC}"
echo "This will take several minutes..."
echo ""

unmount_device "$SD_DEVICE"
wipe_disk "$SD_DEVICE"
write_image "$IMAGE_PATH" "$SD_DEVICE"
sync

echo ""
echo "Image written successfully."

# ===================================
# STEP 5: Configure Cloud-Init
# ===================================
echo ""
echo -e "${GREEN}Step 5: Configuring cloud-init...${NC}"

refresh_partitions "$SD_DEVICE"

BOOT_PARTITION=$(get_partition_name "$SD_DEVICE" 1)

if ! wait_for_partition "$BOOT_PARTITION" 30; then
    echo -e "${RED}Error: Boot partition not found at $BOOT_PARTITION${NC}"
    exit 1
fi

BOOT_MOUNT="/tmp/qoom-boot-$$"
mount_boot_partition "$BOOT_PARTITION" "$BOOT_MOUNT"

# Enable hardware interfaces in config.txt
echo "Enabling hardware interfaces (I2C, SPI)..."
CONFIG_FILE="$BOOT_MOUNT/config.txt"
if [ -f "$CONFIG_FILE" ]; then
    # Enable I2C
    if grep -q "^#dtparam=i2c_arm=on" "$CONFIG_FILE"; then
        sed -i.bak 's/^#dtparam=i2c_arm=on/dtparam=i2c_arm=on/' "$CONFIG_FILE"
    elif ! grep -q "^dtparam=i2c_arm=on" "$CONFIG_FILE"; then
        echo "dtparam=i2c_arm=on" >> "$CONFIG_FILE"
    fi
    
    # Enable SPI
    if grep -q "^#dtparam=spi=on" "$CONFIG_FILE"; then
        sed -i.bak 's/^#dtparam=spi=on/dtparam=spi=on/' "$CONFIG_FILE"
    elif ! grep -q "^dtparam=spi=on" "$CONFIG_FILE"; then
        echo "dtparam=spi=on" >> "$CONFIG_FILE"
    fi
    
    # Clean up backup files
    rm -f "$CONFIG_FILE.bak"
    
    echo "Hardware interfaces enabled in config.txt"
else
    echo -e "${YELLOW}Warning: config.txt not found, skipping hardware interface setup${NC}"
fi

echo "Creating cloud-init configuration files..."

# Create meta-data
cat > "$BOOT_MOUNT/meta-data" << 'META_EOF'
# Cloud-init meta-data for Raspberry Pi
dsmode: local
instance_id: qoom-pi
META_EOF

# Create network-config
cat > "$BOOT_MOUNT/network-config" << NETWORK_EOF
# Network configuration for cloud-init
network:
  version: 2

  ethernets:
    eth0:
      dhcp4: true
      optional: true

  wifis:
    wlan0:
      dhcp4: true
      optional: false
      regulatory-domain: $WIFI_COUNTRY
      access-points:
        "$WIFI_SSID":
          password: "$WIFI_PASSWORD"
NETWORK_EOF

# Create the setup script as a separate file (avoids YAML escaping issues)
cat > "$BOOT_MOUNT/qoom-setup.sh" << 'SETUP_SCRIPT_EOF'
#!/bin/bash
set -e

# Read username from file (copied by cloud-init runcmd)
USERNAME=$(cat /opt/qoom-username.txt 2>/dev/null || cat /boot/firmware/qoom-username.txt)
HOME_DIR="/home/$USERNAME"

echo "=== Qoom Setup Script ==="
echo "User: $USERNAME"
echo "Home: $HOME_DIR"
echo ""

# Wait for network
echo "Waiting for network..."
for i in {1..60}; do
    if ping -c 1 google.com &>/dev/null; then
        echo "Network is up!"
        break
    fi
    sleep 5
done

# Install nvm and Node.js
echo "Installing Node.js via nvm..."
sudo -u $USERNAME bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
sudo -u $USERNAME bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 24 && nvm alias default 24'

# Install PM2
echo "Installing PM2..."
sudo -u $USERNAME bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && npm install -g pm2'

# Clone Qoom repository
echo "Cloning Qoom repository..."
sudo -u $USERNAME git clone https://github.com/Qoomio/AIoT.git $HOME_DIR/qoom || true

# Copy AIoT code to projects folder
echo "Setting up projects folder..."
sudo -u $USERNAME mkdir -p $HOME_DIR/qoom/projects/aiot
cp -r $HOME_DIR/qoom/code/. $HOME_DIR/qoom/projects/aiot/ 2>/dev/null || true
chown -R $USERNAME:$USERNAME $HOME_DIR/qoom

# Install npm dependencies
echo "Installing npm dependencies..."
sudo -u $USERNAME bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd ~/qoom && npm install'
sudo -u $USERNAME bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd ~/qoom && npm run build:editer 2>/dev/null || true'

# Start application with PM2
echo "Starting Qoom with PM2..."
sudo -u $USERNAME bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd ~/qoom && NODE_ENV=education pm2 start ecosystem.config.cjs'
sudo -u $USERNAME bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && pm2 save'

# Setup PM2 startup
echo "Configuring PM2 startup..."
NODE_BIN=$(sudo -u $USERNAME bash -c 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && which node')
NODE_PATH=$(dirname $NODE_BIN)
env PATH=$PATH:$NODE_PATH pm2 startup systemd -u $USERNAME --hp $HOME_DIR || true

# Install uv (Python package manager)
echo "Installing uv..."
sudo -u $USERNAME bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh' || true

echo ""
echo "=== Qoom Setup Complete ==="
echo "Access Qoom at: http://$(hostname -I | awk '{print $1}'):3000"
SETUP_SCRIPT_EOF
chmod +x "$BOOT_MOUNT/qoom-setup.sh"

# Write username to a file for the setup script to read
echo "$PI_USERNAME" > "$BOOT_MOUNT/qoom-username.txt"

# Create user-data (simple, no complex escaping)
cat > "$BOOT_MOUNT/user-data" << USER_EOF
#cloud-config

# Qoom Kit - Cloud-Init Configuration

hostname: $PI_HOSTNAME
manage_etc_hosts: true

keyboard:
  layout: $KEYBOARD_LAYOUT

users:
  - name: $PI_USERNAME
    gecos: Qoom User
    groups: users,sudo,adm,dialout,cdrom,audio,video,plugdev,games,input,render,netdev,gpio,i2c,spi
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    lock_passwd: false
    plain_text_passwd: "$PI_PASSWORD"

ssh_pwauth: true

package_update: true

packages:
  - openssh-server
  - git
  - curl
  - ca-certificates
  - build-essential
  - python3
  - python3-dev
  - python3-libcamera
  - python3-picamera2

runcmd:
  - ["timedatectl", "set-ntp", "true"]
  - ["systemctl", "enable", "ssh"]
  - ["systemctl", "start", "ssh"]
  - ["cp", "/boot/firmware/qoom-setup.sh", "/opt/qoom-setup.sh"]
  - ["cp", "/boot/firmware/qoom-username.txt", "/opt/qoom-username.txt"]
  - ["chmod", "+x", "/opt/qoom-setup.sh"]
  - ["bash", "/opt/qoom-setup.sh"]
USER_EOF

echo "Cloud-init files created."

# Cleanup
sync
if [ "$OS_TYPE" = "mac" ]; then
    umount "$BOOT_MOUNT" 2>/dev/null || diskutil unmount "$BOOT_MOUNT" 2>/dev/null || true
    diskutil eject "/dev/$SD_DEVICE" 2>/dev/null || true
else
    umount "$BOOT_MOUNT" 2>/dev/null || true
fi
rmdir "$BOOT_MOUNT" 2>/dev/null || true

# Save credentials
CREDS_FILE="$REAL_HOME/pi-credentials-${PI_USERNAME}.txt"
cat > "$CREDS_FILE" << CREDS_EOF
Qoom Kit - Raspberry Pi Credentials
======================================
Created: $(date)

Username: $PI_USERNAME
Password: $PI_PASSWORD
Hostname: $PI_HOSTNAME

WiFi SSID: $WIFI_SSID
WiFi Country: $WIFI_COUNTRY
Keyboard: $KEYBOARD_LAYOUT

After first boot (wait 5-10 minutes):
  Web: http://<pi-ip-address>:3000
  SSH: ssh $PI_USERNAME@<pi-ip-address>

To find the Pi's IP address:
  - Check your router's admin page
  - Or run: arp -a | grep -i raspberry
  - Or run: ping $PI_HOSTNAME.local

Useful commands:
  pm2 list          - View running processes
  pm2 logs          - View application logs
  pm2 restart all   - Restart the application
CREDS_EOF

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
echo "Credentials saved to: $CREDS_FILE"
echo ""
echo -e "${GREEN}Credentials:${NC}"
echo "  Username: $PI_USERNAME"
echo "  Password: $PI_PASSWORD"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Safely eject the SD card and insert it into the Raspberry Pi"
echo "  2. Power on the Raspberry Pi"
echo "  3. Wait 5-10 minutes for cloud-init to complete setup"
echo "  4. Access Qoom at: http://<pi-ip-address>:3000"
echo "  5. SSH: ssh $PI_USERNAME@<pi-ip-address>"
echo ""
echo "The SD card is ready!"
