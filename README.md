# Cast to TV Gnome Shell Extension
[![HitCount](http://hits.dwyl.io/Rafostar/gnome-shell-extension-cast-to-tv.svg)](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
[![Donate](https://img.shields.io/badge/Donate-PayPal.Me-lightgrey.svg)](https://www.paypal.me/Rafostar)

Cast files to your Chromecast or other devices over local network.

<p align="center">
<img src="https://raw.githubusercontent.com/wiki/Rafostar/gnome-shell-extension-cast-to-tv/images/Cast-to-TV.png" height="500">
</p>

## Installation
### Latest release
[<img src="https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki/images/Gnome-Extensions.png" height="122">](https://extensions.gnome.org/extension/1544/cast-to-tv)
### Install from source
You can alternatively install this extension by cloning latest development code from GitHub. Keep in mind that this might introduce new features, but the code may be buggy or unfinished.
```
cd ~/.local/share/gnome-shell/extensions
git clone https://github.com/Rafostar/gnome-shell-extension-cast-to-tv.git cast-to-tv@rafostar.github.com
```
After doing so, remember to install [required dependencies](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv#requirements).
Restart gnome-shell (Alt+F2, type `r`), then you can enable extension using Gnome Tweak Tool.

## Requirements
Here is a list of required programs that Cast to TV depends on:
* [nodejs](https://www.npmjs.com/get-npm) (with npm package manager)
* [ffmpeg](https://ffmpeg.org) (with ffprobe)

Please make sure you have all of the above installed.
They might be available in your linux distro repos.
Try installing them with your package manager or follow the links for more info.

**Before using extension** you also **must** install some additional npm packages.

* Install npm dependencies:
```
cd ~/.local/share/gnome-shell/extensions/cast-to-tv@rafostar.github.com
npm install
```
You can use hardware VAAPI encoding (optional). This of course requires working VAAPI drivers. More info and how to install VAAPI [here](https://wiki.archlinux.org/index.php/Hardware_video_acceleration).

## Features
* Cast videos or music
* Supports external and built-in subtitles (along with custom fansubs)
* Chromecast remote controller (control playback from gnome top bar)
* Play on other device using integrated web player or other video player (e.g. mpv or vlc)
* Convert videos to supported format on the fly
* Optional VAAPI video encoding for low cpu usage
* Play audio with music visualizations (requires fast cpu)

## How to use
Detailed instructions related to configuration and using the extension are on [wiki](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki).

## Special Thanks
Special thanks go to [Simon Kusterer (xat)](https://github.com/xat) for developing [chromecast-player](https://github.com/xat/chromecast-player) and [Sam Potts](https://github.com/sampotts) for making [Plyr](https://github.com/sampotts/plyr), an awesome HTML5 video player.

## Donation
If you like my work please support it by buying me a cup of coffee :grin:

[![PayPal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
