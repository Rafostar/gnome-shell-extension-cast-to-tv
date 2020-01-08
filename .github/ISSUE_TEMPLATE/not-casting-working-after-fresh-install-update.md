---
name: Not casting/working after fresh install/update
about: If you just installed or updated this extension follow these steps.
title: Casting not working
labels: ''
assignees: Rafostar

---

1. After a fresh install of this extension and it's node modules from extension prefs, usually a reboot fixes this issue (and by reboot I mean full system reboot - not just restarting gnome-shell).

2. Make sure you have receiver type in extension prefs set correctly to desired device type (e.g. "Chromecast"). If it wasn't try casting again.

3. If extension seems to be working (you have a top panel drop down menu), but still experiencing problems with casting, lets take a look at what happens during file cast. Turn off this extension node service without disabling whole extension (from gnome top bar menu). TV indicator icon should disappear from top bar. Then do the following in terminal:

```
cd ~/.local/share/gnome-shell/extensions/cast-to-tv@rafostar.github.com/node_scripts
DEBUG=bridge,chromecast* node server
```

After running, extension menu and indicator should reappear.
Try reproducing your problem and send me output. Stop the terminal process with Ctrl+c buttons.

Output:
```
COPY_HERE
```
