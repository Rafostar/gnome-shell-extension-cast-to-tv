---
name: Problems with video transcoding
about: Video transcoding (either software or hardware accelerated) not working.
title: Transcoding not working
labels: ''
assignees: Rafostar

---

CPU: e.g. i9-9900k
GPU: e.g. Intel UHD Graphics 630

Turn off this extension node service without disabling whole extension (from gnome top bar menu). TV indicator icon should disappear from top bar. Then do the following in terminal:
```
cd ~/.local/share/gnome-shell/extensions/cast-to-tv@rafostar.github.com/node_scripts
DEBUG=bridge,ffmpeg node server
```
After running, extension menu and indicator should reappear.
Try reproducing your problem and send me output. Stop the terminal process with Ctrl+c buttons.

Output:
```
COPY_HERE
```
