# Klyipf Desktop

<img width="1248" height="787" alt="image" src="https://github.com/user-attachments/assets/1a1a1ab7-d371-4cd0-8fd4-a2e375dd9803" />


## Features

- Detect and remove silent parts from videos
- Adjustable silence threshold (dB)
- Configurable minimum silence duration
- Padding duration control for smooth transitions
- User-friendly desktop interface
- Supports multiple video formats (mp4, avi, mov, mkv)
- Normalize audio LUFS for youtube standard

## Installation

1. clone repo
3. Install the application and Download the Ffmpeg latest release for your operating system
2. Launch Desktop app

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up FFmpeg binaries:
   - Create the following directory structure:
     ```
     bin/
     ├── mac/
     │   ├── ffmpeg
     │   └── ffprobe
     └── win/
         ├── ffmpeg.exe
         └── ffprobe.exe
     ```
   - Download FFmpeg binaries and Place the binaries in their respective directories as shown above
4. Run the development server:
   ```bash
   npm run start
   ```

## Building

Build for specific platforms:

```bash
# For macOS
npm run build:mac

# For Windows 64-bit
npm run build:win64

# For Windows 32-bit
npm run build:win32
```

The built applications will be available in the `dist` directory.

## Usage

1. Click "Browse" to select your input video file
2. Choose an output folder for the processed video
3. Adjust the settings (optional):
   - Silence Threshold (dB): Default -45dB
   - Minimum Silence Duration (seconds): Default 0.6s
   - Padding Duration (seconds): Default 0.05s
4. Click "Start Processing" to begin
5. Monitor the progress in real-time
6. Find your processed video in the selected output folder

## Development

This is an Electron-based application using:
- Electron
- FFmpeg for video processing
- Node.js

## License

MIT License 
