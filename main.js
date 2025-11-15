const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const crypto = require('crypto');

// Remove default menu
Menu.setApplicationMenu(null);

// Config dosyası yolu
const configPath = path.join(app.getPath('userData'), 'config.json');
const musicLibraryPath = path.join(app.getPath('userData'), 'music-library.json');
const musicDir = path.join(app.getPath('userData'), 'musics');
const defaultMusicDir = path.join(musicDir, 'default');
const userMusicDir = path.join(musicDir, 'user');

// Config okuma
function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (error) {
        console.error('Config okuma hatası:', error);
    }
    return {};
}

// Config yazma
function saveConfig(config) {
    try {
        fs.ensureDirSync(path.dirname(configPath));
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
        console.error('Config yazma hatası:', error);
    }
}

// Check FFmpeg binaries and set permissions
async function setupFFmpegBinaries() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isWindows = process.platform === 'win32';
    
    let ffmpegPath, ffprobePath;
    
    if (isDevelopment) {
        // Development environment
        if (isWindows) {
            ffmpegPath = path.join(__dirname, 'bin', 'win', 'ffmpeg.exe');
            ffprobePath = path.join(__dirname, 'bin', 'win', 'ffprobe.exe');
        } else {
            ffmpegPath = path.join(__dirname, 'bin', 'mac', 'ffmpeg');
            ffprobePath = path.join(__dirname, 'bin', 'mac', 'ffprobe');
        }
    } else {
        // Production environment
        if (isWindows) {
            ffmpegPath = path.join(process.resourcesPath, 'bin', 'ffmpeg.exe');
            ffprobePath = path.join(process.resourcesPath, 'bin', 'ffprobe.exe');
        } else {
            ffmpegPath = path.join(process.resourcesPath, 'bin', 'ffmpeg');
            ffprobePath = path.join(process.resourcesPath, 'bin', 'ffprobe');
        }
    }

    console.log('FFmpeg Path:', ffmpegPath);
    console.log('FFprobe Path:', ffprobePath);

    // Check if binaries exist
    if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
        console.error('FFmpeg binary not found at:', ffmpegPath);
        console.error('FFprobe binary not found at:', ffprobePath);
        throw new Error('FFmpeg or FFprobe binaries not found.');
    }

    // Set FFmpeg paths
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    return { ffmpegPath, ffprobePath };
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 800,
        minWidth: 1200,
        minHeight: 700,
        show: false,
        titleBarStyle: 'default',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
    
    // Open DevTools in development
    // if (process.env.NODE_ENV === 'development') {
    //     mainWindow.webContents.openDevTools();
    // }
    
    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}

// When application starts
app.whenReady().then(async () => {
    try {
        await setupFFmpegBinaries();
        await initializeMusicLibrary();
        createWindow();
    } catch (error) {
        console.error('Application startup error:', error);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Input file selection
ipcMain.on('select-input', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        event.reply('input-selected', result.filePaths[0]);
    }
});

// Output folder selection
ipcMain.on('select-output', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const outputPath = result.filePaths[0];
        event.reply('output-selected', outputPath);
        
        // Son seçilen output path'i kaydet
        const config = loadConfig();
        config.lastOutputPath = outputPath;
        saveConfig(config);
    }
});

// Son output path'i yükle
ipcMain.on('load-last-output', (event) => {
    const config = loadConfig();
    if (config.lastOutputPath && fs.existsSync(config.lastOutputPath)) {
        event.reply('output-selected', config.lastOutputPath);
    }
});

// Video processing
ipcMain.on('start-processing', async (event, params) => {
    console.log('========================================');
    console.log('RECEIVED start-processing IPC message');
    console.log('Params:', params);
    console.log('========================================');
    
    try {
        const outputFile = path.join(
            params.outputPath,
            `processed_${path.basename(params.inputPath)}`
        );

        // Check if autocut is enabled
        if (!params.autoCutSilence) {
            // Only normalize audio if enabled, otherwise just copy
            event.reply('log', '⚠️ Auto-Cut Silence: DISABLED');
            event.reply('log', `🎚️  Audio Normalization: ${params.normalizeAudio ? 'ENABLED' : 'DISABLED'}`);
            event.reply('log', '');
            
            const tempProcessedFile = path.join(
                params.outputPath,
                `.temp_processed_${path.basename(params.inputPath)}`
            );
            
            if (params.normalizeAudio) {
                event.reply('progress', {
                    status: 'Normalizing audio (no silence cutting)...',
                    percent: 0
                });
                event.reply('log', '🎚️ Applying audio normalization without silence removal...');
                await normalizeAudioOnly(params.inputPath, tempProcessedFile, params, event);
            } else {
                event.reply('progress', {
                    status: 'Preparing video...',
                    percent: 50
                });
                event.reply('log', '📋 No auto-cut - preparing for background music...');
                await fs.copyFile(params.inputPath, tempProcessedFile);
            }
            
            // Add background music (if enabled)
            await addBackgroundMusic(tempProcessedFile, outputFile, event, params);
            
            // Cleanup temp file
            try {
                await fs.remove(tempProcessedFile);
            } catch (err) {
                console.log('Could not remove temp file:', err.message);
            }
            
            event.reply('completed', { success: true, outputFile: outputFile });
            return;
        }
        
        // Auto-cut is enabled
        event.reply('log', '✂️  Auto-Cut Silence: ENABLED');
        event.reply('log', `🎚️  Audio Normalization: ${params.normalizeAudio ? 'ENABLED' : 'DISABLED'}`);
        event.reply('log', '');

        // Phase 1: Detect silences with progress
        event.reply('progress', {
            status: 'Phase 1: Analyzing audio for silence...',
            percent: 0
        });

        const silenceRanges = await detectSilence(params.inputPath, params, event);

        if (silenceRanges.length === 0) {
            event.reply('log', 'No silence found');
            
            const tempProcessedFile = path.join(
                params.outputPath,
                `.temp_processed_${path.basename(params.inputPath)}`
            );
            
            if (params.normalizeAudio) {
                event.reply('progress', {
                    status: 'No silences detected - normalizing audio...',
                    percent: 50
                });
                await normalizeAudioOnly(params.inputPath, tempProcessedFile, params, event);
            } else {
                event.reply('progress', {
                    status: 'No silences detected - preparing for music...',
                    percent: 50
                });
                await fs.copyFile(params.inputPath, tempProcessedFile);
            }
            
            // Add background music (if enabled)
            await addBackgroundMusic(tempProcessedFile, outputFile, event, params);
            
            // Cleanup temp file
            try {
                await fs.remove(tempProcessedFile);
            } catch (err) {
                console.log('Could not remove temp file:', err.message);
            }
            
            event.reply('completed', { success: true, outputFile: outputFile });
            return;
        }

        // Phase 2: Process video (removing silences)
        event.reply('progress', {
            status: 'Phase 2: Processing video (removing silences)...',
            percent: 0
        });
        
        const tempProcessedFile = path.join(
            params.outputPath,
            `.temp_processed_${path.basename(params.inputPath)}`
        );
        
        await processVideo(params.inputPath, tempProcessedFile, silenceRanges, params, event);
        
        // Phase 3: Add background music (if enabled)
        event.reply('progress', {
            status: 'Phase 3: Adding background music...',
            percent: 0
        });
        
        await addBackgroundMusic(tempProcessedFile, outputFile, event, params);
        
        // Cleanup temp file
        try {
            await fs.remove(tempProcessedFile);
        } catch (err) {
            console.log('Could not remove temp file:', err.message);
        }
        
        event.reply('completed', { success: true, outputFile: outputFile });
    } catch (error) {
        event.reply('log', `Error: ${error.message}`);
        event.reply('completed', { success: false });
    }
});

// Show output file in folder
ipcMain.on('show-in-folder', (event, filePath) => {
    shell.showItemInFolder(filePath);
});

// ==================== MUSIC LIBRARY MANAGEMENT ====================

// Load music library
function loadMusicLibrary() {
    try {
        if (fs.existsSync(musicLibraryPath)) {
            return JSON.parse(fs.readFileSync(musicLibraryPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading music library:', error);
    }
    
    // Return default structure
    return {
        musics: [],
        settings: {
            enabled: false,
            mode: 'loop',
            selectedMusicIds: [],
            volume: -24,
            defaultVolume: -24
        }
    };
}

// Save music library
function saveMusicLibrary(library) {
    try {
        fs.ensureDirSync(path.dirname(musicLibraryPath));
        fs.writeFileSync(musicLibraryPath, JSON.stringify(library, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving music library:', error);
    }
}

// Initialize music directories and default music
async function initializeMusicLibrary() {
    try {
        // Create directories
        await fs.ensureDir(defaultMusicDir);
        await fs.ensureDir(userMusicDir);
        
        console.log('Music directories created');
        
        // Load existing library
        const library = loadMusicLibrary();
        
        // If no music exists, add a note (no default music included yet)
        if (library.musics.length === 0) {
            console.log('No default music included. Users can add their own music.');
        }
        
        return library;
    } catch (error) {
        console.error('Error initializing music library:', error);
        return loadMusicLibrary();
    }
}

// Get music duration using ffprobe
function getMusicDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                resolve(metadata.format.duration);
            }
        });
    });
}

// Add user music
async function addUserMusic(filePath) {
    try {
        const library = loadMusicLibrary();
        
        // Generate unique ID
        const musicId = crypto.randomUUID();
        const fileName = path.basename(filePath);
        const targetPath = path.join(userMusicDir, `${musicId}.mp3`);
        
        // Copy file
        await fs.copy(filePath, targetPath);
        
        // Get duration
        const duration = await getMusicDuration(targetPath);
        
        // Add to library
        const music = {
            id: musicId,
            name: path.basename(filePath, path.extname(filePath)),
            filename: `${musicId}.mp3`,
            duration: duration,
            source: 'user',
            addedDate: new Date().toISOString()
        };
        
        library.musics.push(music);
        saveMusicLibrary(library);
        
        console.log('Music added:', music.name);
        return { success: true, music };
    } catch (error) {
        console.error('Error adding user music:', error);
        return { success: false, error: error.message };
    }
}

// IPC Handlers for music library
ipcMain.handle('get-music-library', async () => {
    return loadMusicLibrary();
});

ipcMain.handle('add-user-music', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }
        ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return await addUserMusic(result.filePaths[0]);
    }
    
    return { success: false };
});

ipcMain.handle('save-music-settings', async (event, settings) => {
    console.log('========================================');
    console.log('💾 SAVING MUSIC SETTINGS');
    console.log('Settings received:', JSON.stringify(settings, null, 2));
    
    const library = loadMusicLibrary();
    library.settings = settings;
    saveMusicLibrary(library);
    
    console.log('✅ Music settings saved successfully');
    console.log('Music library path:', musicLibraryPath);
    console.log('========================================');
    
    return { success: true };
});

// ==================== MUSIC PLAYLIST & MIXING ====================

// Get video duration
function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                resolve(metadata.format.duration);
            }
        });
    });
}

// Prepare music playlist based on mode and video duration
async function prepareMusicPlaylist(musicSettings, videoDuration, event) {
    const library = loadMusicLibrary();
    
    event.reply('log', `📀 Preparing music playlist (${musicSettings.mode} mode)`);
    event.reply('log', `   Video duration: ${videoDuration.toFixed(2)}s`);
    event.reply('log', `   Looking for music IDs: [${musicSettings.selectedMusicIds.join(', ')}]`);
    event.reply('log', `   Available music in library: ${library.musics.length}`);
    
    // Log all available music
    library.musics.forEach(m => {
        event.reply('log', `      - ${m.id}: ${m.name} (${m.source})`);
    });
    
    const selectedMusics = library.musics.filter(m => 
        musicSettings.selectedMusicIds.includes(m.id)
    );
    
    event.reply('log', `   Matched ${selectedMusics.length} music(s)`);
    
    if (selectedMusics.length === 0) {
        event.reply('log', '   ❌ ERROR: No music matched the selected IDs!');
        throw new Error('No music selected or music IDs do not match library');
    }
    
    // Get music file paths
    const musicPaths = selectedMusics.map(m => {
        const filePath = m.source === 'default' 
            ? path.join(defaultMusicDir, m.filename)
            : path.join(userMusicDir, m.filename);
        
        event.reply('log', `   Checking: ${m.name}`);
        event.reply('log', `      Path: ${filePath}`);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            event.reply('log', `      ❌ File NOT FOUND!`);
            throw new Error(`Music file not found: ${m.name} at ${filePath}`);
        }
        
        event.reply('log', `      ✓ File exists`);
        return { ...m, filePath };
    });
    
    if (musicSettings.mode === 'loop') {
        // Loop single music
        const music = musicPaths[0];
        event.reply('log', `   🔁 Looping: ${music.name}`);
        return {
            mode: 'loop',
            musicPath: music.filePath,
            duration: videoDuration
        };
    } else {
        // Sequence mode - calculate crossfade
        event.reply('log', `   ▶️  Playing sequence of ${musicPaths.length} tracks`);
        musicPaths.forEach((m, i) => {
            event.reply('log', `      ${i + 1}. ${m.name} (${m.duration.toFixed(2)}s)`);
        });
        
        return {
            mode: 'sequence',
            musicPaths: musicPaths,
            duration: videoDuration
        };
    }
}

// Create music input for FFmpeg (loop or sequence with crossfade)
async function createMusicInput(playlist, tempDir, event) {
    if (playlist.mode === 'loop') {
        // Simple loop - FFmpeg will handle it
        return {
            type: 'loop',
            inputPath: playlist.musicPath
        };
    } else {
        // Sequence with crossfade - concatenate with crossfade filter
        const concatFile = path.join(tempDir, 'music_concat.txt');
        const outputMusic = path.join(tempDir, 'background_music.mp3');
        
        event.reply('log', '🎵 Creating music sequence with crossfade...');
        
        // Build FFmpeg filter for crossfade
        const musicPaths = playlist.musicPaths;
        
        if (musicPaths.length === 1) {
            // Single music, just copy
            return {
                type: 'single',
                inputPath: musicPaths[0].filePath
            };
        }
        
        // Create crossfade chain
        return new Promise((resolve, reject) => {
            const command = ffmpeg();
            
            // Add all music inputs
            musicPaths.forEach(m => {
                command.input(m.filePath);
            });
            
            // Build crossfade filter chain
            let filterComplex = [];
            const crossfadeDuration = 4; // 4 seconds crossfade
            
            // First crossfade
            filterComplex.push(
                `[0:a][1:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri[a01]`
            );
            
            // Subsequent crossfades
            for (let i = 2; i < musicPaths.length; i++) {
                const prevLabel = i === 2 ? 'a01' : `a0${i-1}`;
                const newLabel = `a0${i}`;
                filterComplex.push(
                    `[${prevLabel}][${i}:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri[${newLabel}]`
                );
            }
            
            const finalLabel = musicPaths.length === 2 ? 'a01' : `a0${musicPaths.length - 1}`;
            
            command
                .complexFilter(filterComplex, finalLabel)
                .outputOptions(['-ac', '2', '-ar', '48000'])
                .on('start', (cmd) => {
                    event.reply('log', '   Merging music tracks with crossfade...');
                })
                .on('stderr', (line) => {
                    if (line.includes('Error') || line.includes('Invalid')) {
                        event.reply('log', `   FFmpeg: ${line}`);
                    }
                })
                .on('error', (err) => {
                    event.reply('log', `   ❌ Crossfade error: ${err.message}`);
                    reject(err);
                })
                .on('end', () => {
                    event.reply('log', '   ✓ Music sequence created');
                    resolve({
                        type: 'sequence',
                        inputPath: outputMusic
                    });
                })
                .save(outputMusic);
        });
    }
}

// Add background music to processed video
async function addBackgroundMusic(processedVideoPath, outputPath, event, params) {
    event.reply('log', '');
    event.reply('log', '========================================');
    event.reply('log', '🎵 BACKGROUND MUSIC PROCESSING');
    event.reply('log', '========================================');
    
    const musicLibrary = loadMusicLibrary();
    const musicSettings = musicLibrary.settings;
    
    // Debug log
    event.reply('log', `📊 Music Settings:
   - Enabled (from params): ${params.backgroundMusicEnabled}
   - Mode: ${musicSettings.mode}
   - Selected Music IDs: [${musicSettings.selectedMusicIds.join(', ')}]
   - Volume: ${musicSettings.volume} dB
   - Total music in library: ${musicLibrary.musics.length}`);
    
    // Check if music is enabled (from params)
    if (!params.backgroundMusicEnabled) {
        event.reply('log', '⚠️  Background Music: DISABLED (by user in UI)');
        event.reply('log', '   → Copying processed video without music...');
        await fs.copy(processedVideoPath, outputPath);
        return;
    }
    
    // Check if music is selected
    if (!musicSettings.selectedMusicIds || musicSettings.selectedMusicIds.length === 0) {
        event.reply('log', '⚠️  Background Music: ENABLED but NO music selected!');
        event.reply('log', '   → Skipping background music...');
        await fs.copy(processedVideoPath, outputPath);
        return;
    }
    
    event.reply('log', '✅ Background Music: READY TO PROCESS');
    event.reply('log', `   Selected ${musicSettings.selectedMusicIds.length} music(s) in ${musicSettings.mode} mode`);
    event.reply('progress', {
        status: 'Adding background music...',
        percent: 0
    });
    
    try {
        // Get video duration
        const videoDuration = await getVideoDuration(processedVideoPath);
        
        // Prepare music playlist
        const playlist = await prepareMusicPlaylist(musicSettings, videoDuration, event);
        
        // Create temp directory
        const tempDir = path.join(path.dirname(outputPath), '.music_temp');
        await fs.ensureDir(tempDir);
        
        try {
            // Create music input
            const musicInput = await createMusicInput(playlist, tempDir, event);
            
            event.reply('log', '');
            event.reply('log', '═══════════════════════════════════════');
            event.reply('log', '🎬 MIXING VIDEO WITH MUSIC');
            event.reply('log', '═══════════════════════════════════════');
            event.reply('log', `📊 Mix settings:`);
            event.reply('log', `   • Music type: ${musicInput.type}`);
            event.reply('log', `   • Music path: ${musicInput.inputPath}`);
            event.reply('log', `   • Video duration: ${videoDuration.toFixed(2)}s`);
            event.reply('log', `   • Music volume: ${musicSettings.volume} dB`);
            event.reply('log', `   • Fade out: Last 3 seconds`);
            event.reply('log', '');
            
            // Mix video and music
            await mixVideoWithMusic(
                processedVideoPath,
                musicInput,
                outputPath,
                videoDuration,
                musicSettings.volume,
                event
            );
            
            event.reply('log', '');
            event.reply('log', '✅ BACKGROUND MUSIC ADDED SUCCESSFULLY!');
            event.reply('log', '═══════════════════════════════════════');
        } finally {
            // Cleanup temp directory
            await fs.remove(tempDir).catch(() => {});
        }
    } catch (error) {
        event.reply('log', `❌ Error adding background music: ${error.message}`);
        event.reply('log', `   Stack: ${error.stack}`);
        // If music fails, copy the processed video
        try {
            await fs.copy(processedVideoPath, outputPath);
            event.reply('log', '   Copied video without music (fallback)');
        } catch (copyError) {
            event.reply('log', `   ❌ Failed to copy video: ${copyError.message}`);
            throw copyError;
        }
    }
}

// Mix video with background music using FFmpeg
function mixVideoWithMusic(videoPath, musicInput, outputPath, videoDuration, volumeDb, event) {
    return new Promise((resolve, reject) => {
        // First, check if video has audio stream
        ffmpeg.ffprobe(videoPath, (probeErr, metadata) => {
            if (probeErr) {
                event.reply('log', `   ❌ Cannot probe video: ${probeErr.message}`);
                return reject(probeErr);
            }
            
            const hasAudioStream = metadata.streams.some(s => s.codec_type === 'audio');
            event.reply('log', `   Video has audio stream: ${hasAudioStream ? 'YES' : 'NO'}`);
            
            const command = ffmpeg();
            
            // Add video input
            command.input(videoPath);
            
            // Add music input
            command.input(musicInput.inputPath);
            
            // Build filter complex
            let filterComplex = [];
            
            // Prepare background music
            if (musicInput.type === 'loop') {
                // Loop music and trim to video duration with fade out
                filterComplex.push(
                    `[1:a]aloop=loop=-1:size=2e9,atrim=0:${videoDuration},afade=t=out:st=${Math.max(0, videoDuration - 3)}:d=3,volume=${volumeDb}dB[bg_music]`
                );
            } else {
                // Trim to video duration with fade out
                filterComplex.push(
                    `[1:a]atrim=0:${videoDuration},afade=t=out:st=${Math.max(0, videoDuration - 3)}:d=3,volume=${volumeDb}dB[bg_music]`
                );
            }
            
            // Mix audio based on whether video has audio
            if (hasAudioStream) {
                // Mix original audio with background music
                filterComplex.push(
                    '[0:a][bg_music]amix=inputs=2:duration=first:weights=1 0.3[aout]'
                );
                
                command
                    .complexFilter(filterComplex)
                    .outputOptions([
                        '-map', '0:v',          // Video from input 0
                        '-map', '[aout]',       // Mixed audio
                        '-c:v', 'copy',         // Copy video (no re-encoding)
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-ar', '48000',
                        '-ac', '2',
                        '-movflags', '+faststart'
                    ]);
            } else {
                // Video has no audio, just use background music
                event.reply('log', '   ⚠️  Video has no audio stream, using only background music');
                
                command
                    .complexFilter(filterComplex)
                    .outputOptions([
                        '-map', '0:v',          // Video from input 0
                        '-map', '[bg_music]',   // Background music only
                        '-c:v', 'copy',         // Copy video (no re-encoding)
                        '-c:a', 'aac',
                        '-b:a', '192k',
                        '-ar', '48000',
                        '-ac', '2',
                        '-movflags', '+faststart'
                    ]);
            }
            
            command
                .on('start', (cmd) => {
                    event.reply('log', '   ▶️  Starting FFmpeg...');
                    event.reply('log', `   Command: ${cmd.substring(0, 300)}...`);
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        event.reply('progress', {
                            status: `Mixing: ${progress.percent.toFixed(1)}%`,
                            percent: progress.percent
                        });
                    }
                })
                .on('stderr', (line) => {
                    // Log important errors only
                    if (line.includes('Error') || line.includes('Invalid') || line.includes('does not exist')) {
                        event.reply('log', `   FFmpeg stderr: ${line}`);
                    }
                })
                .on('error', (err) => {
                    event.reply('log', `   ❌ FFmpeg error: ${err.message}`);
                    event.reply('log', `   Video: ${videoPath}`);
                    event.reply('log', `   Music: ${musicInput.inputPath}`);
                    event.reply('log', `   Output: ${outputPath}`);
                    reject(err);
                })
                .on('end', () => {
                    event.reply('log', '   ✓ Mixing complete');
                    resolve();
                })
                .save(outputPath);
        });
    });
}

// Normalize audio only (no silence cutting)
function normalizeAudioOnly(inputFile, outputFile, params, event) {
    return new Promise((resolve, reject) => {
        event.reply('log', '');
        event.reply('log', '═══════════════════════════════════════');
        event.reply('log', '🎚️  AUDIO NORMALIZATION');
        event.reply('log', '═══════════════════════════════════════');
        event.reply('log', `📁 Input: ${inputFile}`);
        event.reply('log', `📁 Output: ${outputFile}`);
        event.reply('log', '');
        event.reply('log', '⚙️  Normalization settings:');
        event.reply('log', `   • Target loudness: -16 LUFS (YouTube standard)`);
        event.reply('log', `   • True Peak: -1.5 dB`);
        event.reply('log', `   • Loudness Range: 11 LU`);
        event.reply('log', `   • Video codec: COPY (no re-encoding)`);
        event.reply('log', `   • Audio codec: AAC 192k`);
        event.reply('log', '');
        
        const command = ffmpeg(inputFile)
            .audioFilters([
                'loudnorm=I=-16:TP=-1.5:LRA=11' // YouTube standard
            ])
            .outputOptions([
                '-c:v', 'copy',  // Copy video stream without re-encoding
                '-c:a', 'aac',
                '-b:a', '192k',
                '-ar', '48000',
                '-ac', '2',
                '-movflags', '+faststart'
            ])
            .on('start', (cmd) => {
                event.reply('log', '▶️  FFmpeg processing started');
                event.reply('log', `   Command: ${cmd.substring(0, 150)}...`);
                event.reply('log', '');
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    event.reply('log', `   ⏱️  Progress: ${progress.percent.toFixed(1)}%`);
                    event.reply('progress', {
                        status: `Normalizing: ${progress.percent.toFixed(1)}%`,
                        percent: progress.percent
                    });
                }
            })
            .on('error', (err) => {
                event.reply('log', '');
                event.reply('log', `❌ ERROR: ${err.message}`);
                event.reply('log', '═══════════════════════════════════════');
                reject(err);
            })
            .on('end', () => {
                event.reply('log', '');
                event.reply('log', '✅ NORMALIZATION COMPLETE');
                event.reply('log', '═══════════════════════════════════════');
                event.reply('progress', {
                    status: 'Complete!',
                    percent: 100
                });
                resolve();
            })
            .save(outputFile);
    });
}

async function detectSilence(inputFile, params, event) {
    return new Promise((resolve, reject) => {
        let silenceRanges = [];
        let startTime = null;
        let hasAudioStream = false;

        event.reply('log', '');
        event.reply('log', '═══════════════════════════════════════');
        event.reply('log', '🔍 PHASE 1: SILENCE DETECTION');
        event.reply('log', '═══════════════════════════════════════');
        event.reply('log', `📁 Input file: ${inputFile}`);
        event.reply('log', `⚙️  Parameters:`);
        event.reply('log', `   • Threshold: ${params.silenceDb} dB`);
        event.reply('log', `   • Min Duration: ${params.minSilenceDuration}s`);
        event.reply('log', `   • Padding: ${params.paddingDuration}s`);
        event.reply('log', '');

        // First check if video has audio stream
        ffmpeg.ffprobe(inputFile, (probeErr, metadata) => {
            if (probeErr) {
                event.reply('log', `❌ ERROR: Could not probe file`);
                event.reply('log', `   ${probeErr.message}`);
                return reject(probeErr);
            }

            hasAudioStream = metadata.streams.some(s => s.codec_type === 'audio');
            event.reply('log', `📊 Video Analysis:`);
            event.reply('log', `   • Has audio stream: ${hasAudioStream ? 'YES' : 'NO'}`);
            
            if (!hasAudioStream) {
                event.reply('log', '');
                event.reply('log', '⚠️  WARNING: No audio stream found');
                event.reply('log', '   → Skipping silence detection');
                event.reply('log', '═══════════════════════════════════════');
                return resolve([]);
            }

            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            event.reply('log', `   • Audio codec: ${audioStream.codec_name}`);
            event.reply('log', `   • Sample rate: ${audioStream.sample_rate}Hz`);
            event.reply('log', `   • Channels: ${audioStream.channels}`);
            event.reply('log', `   • Duration: ${metadata.format.duration.toFixed(2)}s`);
            event.reply('log', '');
            event.reply('log', '🔎 Starting audio analysis...');
            event.reply('log', '   Scanning for silent sections...');
            event.reply('log', '');

            // Proceed with silence detection
            let analysisProgress = 0;
            ffmpeg(inputFile)
                .outputOptions(['-f', 'null'])
                .audioFilters(`silencedetect=noise=${params.silenceDb}dB:d=${params.minSilenceDuration}`)
                .output('-')
                .on('start', command => {
                    event.reply('log', '▶️  FFmpeg command started');
                    event.reply('log', `   Command: silencedetect filter with noise=${params.silenceDb}dB`);
                    event.reply('log', '');
                })
                .on('stderr', line => {
                    // Log progress
                    if (line.includes('time=')) {
                        const timeMatch = line.match(/time=([\d:]+)/);
                        if (timeMatch && analysisProgress++ % 10 === 0) {
                            event.reply('log', `   ⏱️  Processing: ${timeMatch[1]}`);
                        }
                    }

                    const silenceStart = line.match(/silence_start: ([\d.]+)/);
                    const silenceEnd = line.match(/silence_end: ([\d.]+)/);

                    if (silenceStart) {
                        startTime = parseFloat(silenceStart[1]);
                        event.reply('log', `   🔇 Silence START detected at ${startTime.toFixed(3)}s`);
                    }
                    if (silenceEnd && startTime !== null) {
                        const endTime = parseFloat(silenceEnd[1]);
                        event.reply('log', `   🔊 Silence END detected at ${endTime.toFixed(3)}s`);
                        
                        const paddingDur = parseFloat(params.paddingDuration);
                        const adjustedStart = startTime + paddingDur;
                        const adjustedEnd = endTime - paddingDur;
                        const duration = adjustedEnd - adjustedStart;
                        
                        event.reply('log', `   📏 Calculating adjusted range:`);
                        event.reply('log', `      • Original: ${startTime.toFixed(3)}s → ${endTime.toFixed(3)}s (${(endTime - startTime).toFixed(3)}s)`);
                        event.reply('log', `      • Padding applied: +${paddingDur}s / -${paddingDur}s`);
                        event.reply('log', `      • Adjusted: ${adjustedStart.toFixed(3)}s → ${adjustedEnd.toFixed(3)}s (${duration.toFixed(3)}s)`);
                        
                        // Only add if duration is positive and meaningful
                        if (duration > 0.05) {  // Minimum 50ms (düşürüldü - daha fazla kesim için)
                            silenceRanges.push({
                                start: adjustedStart,
                                end: adjustedEnd
                            });
                            event.reply('log', `      ✅ ACCEPTED: Silence range #${silenceRanges.length} added`);
                        } else {
                            event.reply('log', `      ⚠️  REJECTED: Duration too short (< 0.1s)`);
                        }
                        event.reply('log', '');
                        startTime = null;
                    }
                })
                .on('end', () => {
                    event.reply('log', '');
                    event.reply('log', '✅ ANALYSIS COMPLETE');
                    event.reply('log', `   • Total silence ranges found: ${silenceRanges.length}`);
                    if (silenceRanges.length > 0) {
                        const totalSilence = silenceRanges.reduce((sum, r) => sum + (r.end - r.start), 0);
                        event.reply('log', `   • Total silence duration: ${totalSilence.toFixed(2)}s`);
                        event.reply('log', `   • Average silence length: ${(totalSilence / silenceRanges.length).toFixed(2)}s`);
                        event.reply('log', '');
                        event.reply('log', '📋 Silence ranges to remove:');
                        silenceRanges.forEach((range, i) => {
                            event.reply('log', `   ${i + 1}. ${range.start.toFixed(3)}s → ${range.end.toFixed(3)}s (${(range.end - range.start).toFixed(3)}s)`);
                        });
                    }
                    event.reply('log', '═══════════════════════════════════════');
                    resolve(silenceRanges);
                })
                .on('error', (err) => {
                    event.reply('log', '');
                    event.reply('log', '❌ ERROR during silence detection');
                    event.reply('log', `   ${err.message}`);
                    event.reply('log', '═══════════════════════════════════════');
                    reject(err);
                })
                .run();
        });
    });
}

// Calculate non-silent segments from silence ranges
function calculateNonSilentSegments(silenceRanges, totalDuration, event) {
    const segments = [];
    const MIN_SEGMENT_DURATION = 0.05; // 50ms minimum (düşürüldü)
    
    event.reply('log', '');
    event.reply('log', '═══════════════════════════════════════');
    event.reply('log', '📐 CALCULATING NON-SILENT SEGMENTS');
    event.reply('log', '═══════════════════════════════════════');
    
    // Add first segment if video doesn't start with silence
    if (silenceRanges.length === 0) {
        // No silence detected, return entire video
        event.reply('log', '⚠️  No silence ranges detected');
        event.reply('log', `   → Keeping entire video (0.000s → ${totalDuration.toFixed(3)}s)`);
        event.reply('log', '═══════════════════════════════════════');
        return [{ start: 0, end: totalDuration }];
    }
    
    event.reply('log', `📊 Input data:`);
    event.reply('log', `   • Total video duration: ${totalDuration.toFixed(3)}s`);
    event.reply('log', `   • Silence ranges to remove: ${silenceRanges.length}`);
    event.reply('log', `   • Min segment duration: ${MIN_SEGMENT_DURATION}s`);
    event.reply('log', '');
    
    // First segment (start to first silence)
    event.reply('log', '🔍 Analyzing segment boundaries:');
    event.reply('log', '');
    event.reply('log', '1️⃣  FIRST SEGMENT (video start → first silence)');
    if (silenceRanges[0].start > MIN_SEGMENT_DURATION) {
        segments.push({
            start: 0,
            end: silenceRanges[0].start
        });
        event.reply('log', `   ✅ KEEP: 0.000s → ${silenceRanges[0].start.toFixed(3)}s`);
        event.reply('log', `   Duration: ${silenceRanges[0].start.toFixed(3)}s`);
    } else {
        event.reply('log', `   ❌ SKIP: Too short (${silenceRanges[0].start.toFixed(3)}s < ${MIN_SEGMENT_DURATION}s)`);
    }
    event.reply('log', '');
    
    // Middle segments (between silences)
    if (silenceRanges.length > 1) {
        event.reply('log', '🔄 MIDDLE SEGMENTS (between silence ranges)');
        for (let i = 0; i < silenceRanges.length - 1; i++) {
            const segStart = silenceRanges[i].end;
            const segEnd = silenceRanges[i + 1].start;
            const duration = segEnd - segStart;
            
            event.reply('log', `   Segment ${i + 1}:`);
            event.reply('log', `      Range: ${segStart.toFixed(3)}s → ${segEnd.toFixed(3)}s`);
            event.reply('log', `      Duration: ${duration.toFixed(3)}s`);
            
            // Only add if segment is meaningful
            if (duration > MIN_SEGMENT_DURATION) {
                segments.push({
                    start: segStart,
                    end: segEnd
                });
                event.reply('log', `      ✅ KEEP`);
            } else {
                event.reply('log', `      ❌ SKIP: Too short (< ${MIN_SEGMENT_DURATION}s)`);
            }
            event.reply('log', '');
        }
    }
    
    // Last segment (last silence to end)
    event.reply('log', '🏁 FINAL SEGMENT (last silence → video end)');
    const lastSilence = silenceRanges[silenceRanges.length - 1];
    const lastSegmentDuration = totalDuration - lastSilence.end;
    
    event.reply('log', `   Range: ${lastSilence.end.toFixed(3)}s → ${totalDuration.toFixed(3)}s`);
    event.reply('log', `   Duration: ${lastSegmentDuration.toFixed(3)}s`);
    
    if (lastSegmentDuration > MIN_SEGMENT_DURATION) {
        segments.push({
            start: lastSilence.end,
            end: totalDuration
        });
        event.reply('log', `   ✅ KEEP`);
    } else {
        event.reply('log', `   ❌ SKIP: Too short (< ${MIN_SEGMENT_DURATION}s)`);
    }
    
    event.reply('log', '');
    event.reply('log', '📊 SUMMARY:');
    event.reply('log', `   • Total segments to keep: ${segments.length}`);
    const totalKeptDuration = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    const removedDuration = totalDuration - totalKeptDuration;
    const reductionPercent = (removedDuration / totalDuration * 100).toFixed(1);
    event.reply('log', `   • Total kept duration: ${totalKeptDuration.toFixed(2)}s`);
    event.reply('log', `   • Total removed duration: ${removedDuration.toFixed(2)}s`);
    event.reply('log', `   • Video reduction: ${reductionPercent}%`);
    event.reply('log', '');
    event.reply('log', '📋 Segments list:');
    segments.forEach((seg, i) => {
        event.reply('log', `   ${i + 1}. ${seg.start.toFixed(3)}s → ${seg.end.toFixed(3)}s (${(seg.end - seg.start).toFixed(3)}s)`);
    });
    event.reply('log', '═══════════════════════════════════════');
    
    return segments;
}

// Extract segments and concatenate them
async function processVideo(inputFile, outputFile, silenceRanges, params, event) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get video metadata for duration and stream info
            ffmpeg.ffprobe(inputFile, async (err, metadata) => {
                if (err) {
                    event.reply('log', `❌ Error reading video metadata: ${err.message}`);
                    return reject(err);
                }
                
                const totalDuration = metadata.format.duration;
                const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
                
                if (!videoStream) {
                    return reject(new Error('No video stream found'));
                }
                
                event.reply('log', `📊 Input Duration: ${totalDuration.toFixed(2)}s`);
                event.reply('log', `📹 Video: ${videoStream.codec_name} ${videoStream.width}x${videoStream.height} @ ${videoStream.r_frame_rate} fps`);
                if (audioStream) {
                    event.reply('log', `🔊 Audio: ${audioStream.codec_name} ${audioStream.sample_rate}Hz ${audioStream.channels}ch`);
                }
                
                // Audio normalization info
                if (params.normalizeAudio) {
                    event.reply('log', `🎚️  Audio Normalization: Enabled (Target: -16 LUFS)`);
                } else {
                    event.reply('log', `🎚️  Audio Normalization: Disabled`);
                }
                
                // Calculate non-silent segments
                const segments = calculateNonSilentSegments(silenceRanges, totalDuration, event);
                
                if (segments.length === 0) {
                    event.reply('log', '⚠️ No non-silent segments found!');
                    return reject(new Error('No content to process'));
                }
                
                const expectedOutputDuration = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
                const reductionPercent = ((totalDuration - expectedOutputDuration) / totalDuration * 100).toFixed(1);
                event.reply('log', `📊 Expected output: ${expectedOutputDuration.toFixed(2)}s (${reductionPercent}% reduction)`);
                
                // Create temp directory for segments
                const tempDir = path.join(path.dirname(outputFile), '.klyppr_temp');
                await fs.ensureDir(tempDir);
                
                try {
                    // Extract each segment (parallel batch processing)
                    event.reply('log', '');
                    event.reply('log', '═══════════════════════════════════════');
                    event.reply('log', '✂️  PHASE 2: SEGMENT EXTRACTION');
                    event.reply('log', '═══════════════════════════════════════');
                    event.reply('log', `📊 Extraction plan:`);
                    event.reply('log', `   • Total segments: ${segments.length}`);
                    event.reply('log', `   • Batch size: 4 segments (parallel)`);
                    event.reply('log', `   • Temp directory: ${tempDir}`);
                    event.reply('log', `   • Normalization: ${params.normalizeAudio ? 'ENABLED' : 'DISABLED'}`);
                    event.reply('log', '');
                    const segmentFiles = [];
                    
                    // Prepare segment file paths
                    for (let i = 0; i < segments.length; i++) {
                        const segmentFile = path.join(tempDir, `segment_${i.toString().padStart(4, '0')}.mp4`);
                        segmentFiles.push(segmentFile);
                    }
                    
                    // Process segments in parallel batches
                    const BATCH_SIZE = 4; // Process 4 segments simultaneously
                    let processedCount = 0;
                    
                    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
                        const batchEnd = Math.min(i + BATCH_SIZE, segments.length);
                        const batchSegments = segments.slice(i, batchEnd);
                        const batchFiles = segmentFiles.slice(i, batchEnd);
                        
                        event.reply('log', '');
                        event.reply('log', `📦 BATCH ${Math.floor(i / BATCH_SIZE) + 1}: Segments ${i + 1}-${batchEnd}`);
                        
                        // Process batch in parallel
                        await Promise.all(
                            batchSegments.map((seg, idx) => 
                                extractSegment(inputFile, batchFiles[idx], seg.start, seg.end, params, event)
                            )
                        );
                        
                        processedCount += batchSegments.length;
                        const segmentProgress = ((processedCount / segments.length) * 50).toFixed(1);
                        event.reply('progress', {
                            status: `Extracted ${processedCount}/${segments.length} segments...`,
                            percent: parseFloat(segmentProgress)
                        });
                        event.reply('log', '');
                        event.reply('log', `   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1} complete (${processedCount}/${segments.length} total)`);
                    }
                    
                    event.reply('log', '');
                    event.reply('log', `✅ All ${segments.length} segments extracted successfully`);
                    event.reply('log', '═══════════════════════════════════════');
                    
                    // Concatenate segments
                    event.reply('log', '');
                    event.reply('log', '═══════════════════════════════════════');
                    event.reply('log', '🔗 PHASE 3: CONCATENATION');
                    event.reply('log', '═══════════════════════════════════════');
                    event.reply('log', `📊 Merging ${segments.length} segments into final video...`);
                    event.reply('progress', {
                        status: 'Merging segments...',
                        percent: 50
                    });
                    
                    await concatenateSegments(segmentFiles, outputFile, params, event);
                    
                    // Cleanup temp files
                    event.reply('log', '');
                    event.reply('log', '🧹 Cleaning up temporary files...');
                    event.reply('log', `   Removing: ${tempDir}`);
                    await fs.remove(tempDir);
                    event.reply('log', `   ✓ Cleanup complete`);
                    event.reply('log', '');
                    event.reply('log', '✅ VIDEO PROCESSING COMPLETED SUCCESSFULLY!');
                    event.reply('log', '═══════════════════════════════════════');
                    event.reply('progress', {
                        status: 'Complete!',
                        percent: 100
                    });
                    
                    resolve();
                } catch (error) {
                    // Cleanup on error
                    await fs.remove(tempDir).catch(() => {});
                    throw error;
                }
            });
        } catch (error) {
            event.reply('log', `❌ Error: ${error.message}`);
            reject(error);
        }
    });
}

// Extract a single segment with exact timing
function extractSegment(inputFile, outputFile, startTime, endTime, params, event) {
    return new Promise((resolve, reject) => {
        const duration = endTime - startTime;
        
        event.reply('log', `      ▶️  Extracting segment:`);
        event.reply('log', `         • Start: ${startTime.toFixed(3)}s`);
        event.reply('log', `         • End: ${endTime.toFixed(3)}s`);
        event.reply('log', `         • Duration: ${duration.toFixed(3)}s`);
        event.reply('log', `         • Output: ${path.basename(outputFile)}`);
        
        // Use accurate seeking: -ss after -i for precise cuts
        const command = ffmpeg(inputFile);
        
        // Audio filter - apply loudness normalization if enabled
        if (params.normalizeAudio) {
            event.reply('log', `         • Normalization: ENABLED (-16 LUFS)`);
            command.audioFilters([
                'loudnorm=I=-16:TP=-1.5:LRA=11' // YouTube standard: -16 LUFS, True Peak -1.5dB
            ]);
        } else {
            event.reply('log', `         • Normalization: DISABLED`);
        }
        
        command
            .outputOptions([
                '-ss', startTime.toString(),      // Accurate seek (after input)
                '-t', duration.toString(),        // Duration to extract
                // High quality encoding
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '20',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-ar', '48000',
                '-ac', '2',
                // Timestamp handling for proper sync
                '-avoid_negative_ts', 'make_zero',
                '-max_muxing_queue_size', '9999'
            ])
            .on('start', (cmd) => {
                event.reply('log', `         • FFmpeg started`);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    event.reply('log', `         • Progress: ${progress.percent.toFixed(1)}%`);
                }
            })
            .on('error', (err) => {
                event.reply('log', `         ❌ ERROR: ${err.message}`);
                reject(err);
            })
            .on('end', () => {
                event.reply('log', `         ✅ Complete`);
                resolve();
            })
            .save(outputFile);
    });
}

// Concatenate segments using concat demuxer (best method for preserving sync)
function concatenateSegments(segmentFiles, outputFile, params, event) {
    return new Promise(async (resolve, reject) => {
        try {
            // Verify all segment files exist
            event.reply('log', '');
            event.reply('log', '🔍 Verifying segment files...');
            let totalSize = 0;
            for (let i = 0; i < segmentFiles.length; i++) {
                const exists = await fs.pathExists(segmentFiles[i]);
                if (!exists) {
                    event.reply('log', `  ❌ Missing: ${path.basename(segmentFiles[i])}`);
                    throw new Error(`Segment file not found: ${segmentFiles[i]}`);
                }
                const stats = await fs.stat(segmentFiles[i]);
                const sizeMB = stats.size / 1024 / 1024;
                totalSize += sizeMB;
                event.reply('log', `  ✓ Segment ${(i + 1).toString().padStart(2, '0')}: ${sizeMB.toFixed(2)} MB - ${path.basename(segmentFiles[i])}`);
            }
            event.reply('log', `  📊 Total size: ${totalSize.toFixed(2)} MB`);
            
            // Create concat list file with proper Windows path handling
            const concatListFile = path.join(path.dirname(outputFile), '.concat_list.txt');
            
            // Convert paths to absolute and escape properly for concat demuxer
            const concatContent = segmentFiles.map(f => {
                const absolutePath = path.resolve(f);
                // For concat demuxer, use forward slashes and escape single quotes
                const normalizedPath = absolutePath.replace(/\\/g, '/').replace(/'/g, "\\'");
                return `file '${normalizedPath}'`;
            }).join('\n');
            
            await fs.writeFile(concatListFile, concatContent, 'utf8');
            event.reply('log', '');
            event.reply('log', `📝 Created concat list file:`);
            event.reply('log', `   Path: ${concatListFile}`);
            event.reply('log', `   Segments: ${segmentFiles.length}`);
            
            // Use concat demuxer to merge segments
            const command = ffmpeg()
                .input(concatListFile)
                .inputOptions([
                    '-f', 'concat',
                    '-safe', '0'
                ]);
            
            // NOTE: Do NOT apply normalization here - segments are already normalized!
            event.reply('log', '');
            event.reply('log', '⚙️  Concatenation settings:');
            event.reply('log', `   • Video codec: libx264 (fast preset, CRF 18)`);
            event.reply('log', `   • Audio codec: AAC 192k`);
            event.reply('log', `   • Normalization: Already applied to segments`);
            event.reply('log', `   • ℹ️  Concat only merges - no re-normalization`);
            event.reply('log', '   • Sync: CFR (constant frame rate)');
            event.reply('log', '');
            
            command
                .outputOptions([
                    // Re-encode with high quality to ensure compatibility
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '18',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-ar', '48000',
                    '-ac', '2',
                    // Ensure proper sync
                    '-vsync', 'cfr',
                    '-async', '1',
                    '-max_muxing_queue_size', '9999',
                    '-movflags', '+faststart'
                ])
                .on('start', (cmd) => {
                    event.reply('log', '▶️  FFmpeg concatenation started');
                    event.reply('log', `   Input: ${segmentFiles.length} segment files`);
                    event.reply('log', `   Output: ${path.basename(outputFile)}`);
                    event.reply('log', '');
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        const totalPercent = 50 + (progress.percent / 2);
                        event.reply('log', `   ⏱️  Merging progress: ${progress.percent.toFixed(1)}%`);
                        event.reply('progress', {
                            status: `Merging: ${progress.percent.toFixed(1)}%`,
                            percent: totalPercent
                        });
                    }
                })
                .on('error', async (err) => {
                    await fs.remove(concatListFile).catch(() => {});
                    event.reply('log', '');
                    event.reply('log', `❌ ERROR: Concatenation failed`);
                    event.reply('log', `   ${err.message}`);
                    reject(err);
                })
                .on('end', async () => {
                    await fs.remove(concatListFile).catch(() => {});
                    event.reply('log', '');
                    event.reply('log', '✅ Concatenation successful!');
                    
                    // Get output file size
                    try {
                        const outputStats = await fs.stat(outputFile);
                        const outputSizeMB = outputStats.size / 1024 / 1024;
                        event.reply('log', `   Final video size: ${outputSizeMB.toFixed(2)} MB`);
                    } catch (e) {}
                    
                    resolve();
                })
                .save(outputFile);
        } catch (error) {
            event.reply('log', `❌ Concatenation error: ${error.message}`);
            reject(error);
        }
    });
} 