---
name: Particular video file not working
about: Problems with a certain video file, while others work fine.
title: Video file not working
labels: ''
assignees: Rafostar

---

Before submitting this issue, please try casting with transcoding audio, video and video+audio (you can find selection box on bottom-left of select video window or in Nautilus right click menu), if neither of them solves your problem fill and submit this new issue.

Please send me the output of (replace `VIDEO.mkv` with your actual file name):
```
ffprobe -show_streams -show_format -print_format json "VIDEO.mkv"
```

Output:
```
COPY_HERE
```
