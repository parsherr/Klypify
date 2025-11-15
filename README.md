# Klyppr Desktop

> **🎉 Version 1.4 Released!** Major update with new features and improvements

This is the desktop version of [Klyppr](https://github.com/muzafferkadir/klyppr), a powerful tool for automatic video silence removal.

## ✨ Features (v1.4)

### Core Features
- **Auto-Cut Silence** - Automatically detect and remove silent parts from videos
- **Audio Normalization** - Normalize audio to YouTube standard (-16 LUFS)
- **Background Music** - Add background music with smart mixing
  - Loop single track or play sequence
  - Adjustable volume (-30dB to -15dB)
  - Automatic fade-out at video end
  - Smooth crossfade transitions between tracks
- **Smart Segment Processing** - Parallel batch processing for fast rendering

### Advanced Settings
- Adjustable silence threshold (default: -28dB)
- Configurable minimum silence duration (default: 0.2s)
- Padding duration control for smooth transitions (default: 0.05s)
- Quick presets: Recommended & Fast

### User Interface
- Modern glassmorphic design
- Real-time processing logs with detailed progress
- Copy all logs to clipboard
- Responsive and intuitive controls
- Supports multiple video formats (mp4, avi, mov, mkv)

## 📦 Installation

### For End Users
1. Download the latest release (v1.4) for your operating system
2. Install the application
3. Launch Klyppr Desktop

*Note: Release builds coming soon for v1.4*

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

## 🚀 Usage

### Basic Workflow
1. **Select Input** - Click "Browse" to select your video file
2. **Choose Output** - Select destination folder for processed video
3. **Configure Options** (optional):
   - **Auto-Cut Silence**: Toggle ON/OFF
   - **Normalize Audio**: Toggle ON/OFF  
   - **Background Music**: Enable and configure music settings
4. **Quick Presets**: Choose "Recommended" or "Fast" for optimal settings
5. **Start Processing** - Monitor real-time progress with detailed logs
6. **Done!** - Find your processed video in the output folder

### Background Music Setup
1. Enable "Add Background Music" toggle
2. Choose playback mode:
   - **Loop One Music**: Continuously loop a single track
   - **Play Sequence**: Play multiple tracks in order with crossfade
3. Click "Add Your Music" to import MP3 files
4. Select music tracks (click to select, click again to deselect)
5. Adjust volume slider (-30dB to -15dB, default: -24dB)
6. Process your video with background music automatically mixed in

### Advanced Settings
- **Silence Threshold**: Default -28dB (higher = more aggressive cutting)
- **Min Silence Duration**: Default 0.2s (shorter = more cuts)
- **Padding Duration**: Default 0.05s (shorter = sharper cuts)

## 🛠️ Tech Stack

This is an Electron-based application using:
- **Electron** - Desktop application framework
- **FFmpeg** - Video/audio processing and analysis
- **Node.js** - Backend runtime
- **Modern CSS** - Glassmorphic UI design

## 📝 Changelog (v1.4)

### New Features
- ✨ Background music system with loop and sequence modes
- 🎵 Music library management (add your own MP3s)
- 🔀 Smooth crossfade transitions between tracks
- 📊 Ultra-detailed processing logs for all operations
- 📋 Copy all logs to clipboard
- 🎨 Modern glassmorphic dashboard redesign

### Improvements
- ⚡ Optimized silence detection algorithm
- 🎯 Better default settings for auto-cut (-28dB threshold)
- 🔧 Fixed double normalization issue
- 📈 Parallel batch processing for segments
- 🎚️ Improved audio mixing with proper level management

### Bug Fixes
- Fixed FFmpeg filter graph errors
- Resolved padding calculation issues
- Corrected segment concatenation logic

## Related Projects

- [Klyppr Web Version](https://github.com/muzafferkadir/klyppr) - The web-based version of Klyppr

## License

MIT License 
