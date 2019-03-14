# Cast to TV Gnome Shell Extension
[![HitCount](http://hits.dwyl.io/Rafostar/gnome-shell-extension-cast-to-tv.svg)](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
[![Donate](https://img.shields.io/badge/Donate-PayPal.Me-lightgrey.svg)](https://www.paypal.me/Rafostar)

Cast files to Chromecast, web browser or media player app over local network.

<p align="center">
<img src="https://raw.githubusercontent.com/wiki/Rafostar/gnome-shell-extension-cast-to-tv/images/Cast-to-TV.png" width="80%" height="80%">
</p>

## Features
* Cast videos, music and pictures to:
  * Chromecast devices
  * Any device with web browser (other PC or smartphone)
  * Media player app (eg. MPV, VLC)
* Supports external and built-in subtitles (along with custom fansubs)
* Chromecast remote controller (control playback from gnome top bar)
* Play on other device using integrated web player
* Transcode videos to supported format on the fly
* Optional VAAPI video encoding for low cpu usage
* Stream music with visualizations (requires fast cpu)

## Installation
### For latest release and changelog check out [releases page](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/releases).

[<img src="https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki/images/Gnome-Extensions.png" width="30%" height="30%">](https://extensions.gnome.org/extension/1544/cast-to-tv)

Installation from source code is described in the [wiki](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki).

After enabling the extension, remember to install [required dependencies](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv#requirements).

## Requirements
Here is a list of required programs that Cast to TV depends on:
* [npm](https://www.npmjs.com/get-npm) (for dependencies installation)
* [nodejs](https://nodejs.org)
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

## How to use
Detailed instructions related to configuration and using the extension are in the [wiki](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki).
<br>You can also find some usage examples there.

Check out [FAQ](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki/FAQ), before asking questions.

## Info for translators
Before translating use Makefile to generate updated POT file.
```
make potfile
```
Use `cast-to-tv.pot` file in `./po` directory to generate `.po` file.
After translating, you can test your translation by running:
```
make compilemo
```
This will create `.mo` files. Restart gnome-shell for changes to be applied.

## Special Thanks
Special thanks go to [Simon Kusterer (xat)](https://github.com/xat) for developing [chromecast-player](https://github.com/xat/chromecast-player) and [Sam Potts](https://github.com/sampotts) for making [Plyr](https://github.com/sampotts/plyr), an awesome HTML5 video player.

### Translations
[@Rafostar](https://github.com/Rafostar) (pl), [@amivaleo](https://github.com/amivaleo) (it), [@TeknoMobil](https://github.com/TeknoMobil) (tr)

## Donation
If you like my work please support it by buying me a cup of coffee :grin:

[![PayPal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
