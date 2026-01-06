# Qoom AIoT

## Who?
- This repo is for those who want to be develop and run on AI + Iot applications on their Raspberry Pis

## What?
Qoom Base AIoT is designed to work primarily on Raspberry Pi single-board computers. It supports most modern Raspberry Pi models, including:

- Raspberry Pi 4 Model B (recommended for optimal performance)
- Raspberry Pi 3 Model B and B+
- Raspberry Pi 3 Model A+
- Raspberry Pi 2 Model B (limited performance for AI workloads)
- Raspberry Pi Zero 2 W (lightweight IoT use cases only)

Older Raspberry Pi models (such as Pi Zero or Pi 1) may be able to run basic IoT functions but are not recommended for AI-based applications due to hardware limitations.

A Raspberry Pi with at least 2GB RAM is recommended for AI use-cases. Raspbian (Raspberry Pi OS) 64-bit is the recommended operating system for best compatibility and performance.

## Where?
This code is designed to run on a headless Raspberry Pi device that is connected to the same local network as a computer. The Raspberry Pi operates without a directly attached monitor or keyboard ("headless"), and you interact with it remotely using your computer's browser. You can run and manage the Qoom editor and applications on the Raspberry Pi from any web browser on another device on the same network.


## Why?
- **Empowers rapid prototyping**: Provides a ready-to-use stack for developing and testing AI + IoT projects without complex system integration.
- **Accessible AI at the edge**: Enables running AI models directly on affordable Raspberry Pi hardware, opening up edge AI use-cases.
- **Remote management**: Allows headless setup and control from any web browser on the same network, making deployments easy and hands-free.
- **Educational value**: Offers a hands-on platform for learning about edge computing, AI, and IoT by building real-world solutions.
- **Flexible applications**: Supports a wide range of IoT and AI projects—from smart sensors to automation and monitoring—on accessible hardware.
- **Open-source ecosystem**: Built on open tools and languages, encouraging customization, collaboration, and transparent improvement.
- **Community integration**: Designed for contribution, remixing, and collaboration within the open IoT and AI landscape.


## How?
To install Qoom AIoT on your Raspberry Pi SD card and access it via your web browser, follow these steps:

### 1. Prepare your SD Card (if not already done):

- Use the provided `prepare_pi.sh` script on your computer to flash and configure Raspberry Pi OS on an SD card, as described at the top of this README. To download and run from github:
```
curl -fsSL https://raw.githubusercontent.com/Qoomio/AIoT/main/scripts/prepare_pi.sh | sudo bash
```


### 2. Boot and Connect:

- Insert the prepared SD card into your Raspberry Pi and power it on.
- Make sure your Pi is connected to the same local network as your computer (via Ethernet or configured Wi-Fi).

### 3. Connect via SSH:

- Find your Pi's IP address (you can use your router admin panel, or tools like `nmap`, or run `ping raspberrypi.local` on your computer).
- Connect via SSH (default password is as set during setup):
  ```bash
  ssh pi@<PI_IP_ADDRESS>
  ```

### 4. Deploy Qoom AIoT:

- Once connected, run the deployment script:
  ```bash
  cd ~/AIoT/products/kits/base_aiot/setup
  chmod +x deploy_aiot.sh
  ./deploy_aiot.sh
  ```
- The script will:
    - Ensure you are in the correct environment
    - Pull the latest code from the Qoom AIoT repository
    - Install dependencies (`npm i`) and required tooling
    - Configure and launch the app using `pm2`

- The install and launch process runs in the background. You can check progress and logs with:
  ```bash
  tail -f /tmp/deploy.log
  ```

### 5. Access Qoom AIoT from your browser:

- Once deployment completes, open your web browser on your computer and navigate to:
  ```
  http://<PI_IP_ADDRESS>:3000
  ```
  Replace `<PI_IP_ADDRESS>` with your actual Raspberry Pi's IP address.

  For example, if your Pi's IP is `192.168.1.42`, visit:
  ```
  http://192.168.1.42:3000
  ```

- You should now see the Qoom AIoT dashboard and can start building and managing your AI + IoT applications!

---
**Tips:**
- Make sure port 3000 is open and not blocked by your local network firewall.
- If the dashboard does not load, check the deployment logs in `/tmp/deploy.log` for errors.
- To stop or restart the app, you can use `pm2` commands (e.g., `pm2 restart aiot`).

