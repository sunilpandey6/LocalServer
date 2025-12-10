const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const plist = require("plist");
const bplist = require("bplist-parser");
const { execSync, exec } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '192.168.1.69';

// creating a temp directory for storing converted icons
const iconcacheDir = path.join(__dirname, "app_icons");
//create if not exists
if (!fs.existsSync(iconcacheDir)) {
    fs.mkdirSync(iconcacheDir);
}
app.use(cors());

// fucntion to parse plist files (XML first and then binary)
function parsePlist(plistPath) {
    const buffer = fs.readFileSync(plistPath);
  
    // try XML first
    try {
      return plist.parse(buffer.toString());
    } catch (err) {
      // fallback to binary plist
      try {
        return bplist.parseBuffer(buffer)[0]; // returns array, take first object
      } catch (err2) {
        console.error('Failed to parse plist:', err2);
        return null;
      }
    }
  }

//function to convert .icns to png Base64
function convertICNSToPNG(icnsPath, appName) {
    try {
        if (!icnsPath || !fs.existsSync(icnsPath)) return null;
        
        const tmpPngPath = path.join(iconcacheDir, `${appName.replace(/ /g, "_")}.png`);
        
        if(fs.existsSync(tmpPngPath)){
            return tmpPngPath;
        }
        execSync(`sips -s format png "${icnsPath}" --out "${tmpPngPath}"`);
        return tmpPngPath;
    } 
    catch (err) {
        console.error("Error converting ICNS to PNG:", err);
        return null;
    }
}



//------------------------------
// Return list of wanted apps from listed folders
//------------------------------
app.get("/applist", (req, res) => {
    const appFolders = [
        "/Applications",
        "/System/Applications",
        path.join(process.env.HOME, "Applications")
    ];

    const wantedApps = [
        "Safari", "Brave", "Chess", "Blender","GitHub Desktop", "Xcode", "Notes", "Mail", "Messages"
    ];

    let results = [];

    appFolders.forEach(folder => {
        if (!fs.existsSync(folder)) return;
        const items = fs.readdirSync(folder);

        items.forEach(appFolderName => {
            if (!appFolderName.endsWith(".app")) return;

            const fullAppPath = path.join(folder, appFolderName);
            const plistPath = path.join(fullAppPath, "Contents", "Info.plist");
            if (!fs.existsSync(plistPath)) return;

            const info = parsePlist(plistPath);
            if (!info) return;

            const appName = info.CFBundleName || appFolderName.replace(".app", "");
            if (!wantedApps.includes(appName)) return;

            // Try to find icon
            let iconPath = null;
            let iconName = info.CFBundleIconFile || info.CFBundleIconName;
            if (iconName) {
                if (!iconName.endsWith(".icns")) iconName += ".icns";
                const iconFilePath = path.join(fullAppPath, "Contents", "Resources", iconName);
                if (fs.existsSync(iconFilePath)) {
                    // Convert ICNS to PNG and get the path
                    iconPath = convertICNSToPNG(iconFilePath, appName);
                }
            }

            // Fallback icon for system apps without .icns (e.g. Calendar, Mail, etc.)
            if (!iconPath) {
                const fallbackPath = path.join(__dirname, "icons", `${appName.toLowerCase()}.png`);
                if (fs.existsSync(fallbackPath)) {
                    iconPath = fallbackPath;
                }
            }

            results.push({
                name: appName,
                appPath: fullAppPath,
                iconPath: iconPath
            });
        });
    });

    res.json({ apps: results });
});
//------------------------------
// Get app icon
//------------------------------
app.get("/getIcon", (req, res) => {
    const appName = req.query.name;
    if (!appName) {
        return res.status(400).json({ error: "App name is required" });
    }
    const iconPath = path.join(iconcacheDir, `${appName.replace(/ /g, "_")}.png`);

    if (fs.existsSync(iconPath)) {
        res.setHeader('Content-Type', 'image/png');
        const iconStream = fs.createReadStream(iconPath);
        iconStream.pipe(res);
    }
    else{
        res.status(404).json({ error: "Icon not found" + appName });
    }
});

//------------------------------
// Launch an app
//------------------------------
app.get("/launch", (req, res) => {
    const appPath = req.query.path;

    if (!appPath || !fs.existsSync(appPath)) {
        return res.status(400).json({ error: "Invalid app path" });
    }

    exec(`open "${appPath}"`, (error) => {
        if (error) {
            console.error("Error launching app:", error);
            return res.status(500).json({ error: "Failed to launch app" });
        }
        res.json({ status: "App launched successfully" });
    });
});

//------------------------------
//Streaming
//------------------------------
app.get("/stream", (req, res) => {
    console.log("Streaming requested");
    //call helperscript to start streaming with appname
});

//------------------------------
//Ping Pong endpoint check
//------------------------------
app.get("/ping", (req, res) => {
    res.send("pong");
  });

//------------------------------
// Start the server
//------------------------------
const server = app.listen(PORT, HOST, () => {
    console.log(`✅ HTTP running at http://${HOST}:${PORT}`);

  });

//------------------------------
// making websoctets server
//------------------------------
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

let unity = null;
let helper = null;

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.role === 'unity') {
            unity = ws;
            console.log('✅ Unity connected');
        }
        if (data.role === 'helper') {
            helper = ws;
            console.log('✅ helper connected');
        }

        if (data.to === 'unity' && unity)
            unity.send(message);

        if (data.to === 'helper' && helper)
            helper.send(message);
    });   
});