# Gnome Shell Extension Cast to TV
[![License](https://img.shields.io/github/license/Rafostar/gnome-shell-extension-cast-to-tv.svg)](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/blob/master/COPYING)
[![Crowdin](https://d322cqt584bo4o.cloudfront.net/cast-to-tv/localized.svg)](https://crowdin.com/project/cast-to-tv)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
[![Donate](https://img.shields.io/badge/Donate-PayPal.Me-lightgrey.svg)](https://www.paypal.me/Rafostar)
[![Twitter](https://img.shields.io/twitter/url/https/github.com/Rafostar/gnome-shell-extension-cast-to-tv.svg?style=social)](https://twitter.com/intent/tweet?text=Wow:&url=https%3A%2F%2Fgithub.com%2FRafostar%2Fgnome-shell-extension-cast-to-tv)

<p align="center">
<img src="https://raw.githubusercontent.com/wiki/Rafostar/gnome-shell-extension-cast-to-tv/images/promo.gif">
</p>

## Features
* Cast videos, music and pictures to:
  * Chromecast devices
  * Any device with web browser (other PC or smartphone)
  * Media player app (eg. MPV, VLC)
* Supports external and built-in subtitles (along with custom fansubs)
* Chromecast remote controller (control playback from gnome top bar)
* Play on other device using integrated web player and change content without refreshing web page
* Transcode videos to supported format on the fly
* Optional VAAPI/NVENC video encoding for low cpu usage
* Stream music with visualizations (requires fast cpu)
* Nautilus right click menu integration
* Media playlist with "Drag and Drop" support

[Playercast](https://rafostar.github.io/playercast) app turns your media player on any other Linux device (e.g. HTPC, Raspberry Pi) into a media receiver that works similarly to Chromecast.

Expand extension functionality through Add-ons:
* [Links Add-on](https://github.com/Rafostar/cast-to-tv-links-addon) - cast media from web pages
* [Desktop Add-on](https://github.com/Rafostar/cast-to-tv-desktop-addon) - desktop streaming

## Download
### For latest release and changelog check out [releases page](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/releases).

[<img src="https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki/images/Gnome-Extensions.png" width="30%" height="30%">](https://extensions.gnome.org/extension/1544/cast-to-tv)

Installation from source code is described in the [wiki](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki).

After enabling the extension, remember to install all [requirements](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv#requirements) and [npm dependencies](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv#install-npm-dependencies).

## Requirements
Here is a list of required programs that Cast to TV depends on:
* [npm](https://www.npmjs.com/get-npm) (for dependencies installation)
* [nodejs](https://nodejs.org)
* [ffmpeg](https://ffmpeg.org) (with ffprobe)

Please make sure you have all of the above installed.

### Optional:
* [nautilus-python](https://github.com/GNOME/nautilus-python) (for nautilus integration)

Nautilus extension is included in Cast to TV (since version 9).

You can optionally use hardware VAAPI or NVENC encoding. This of course requires working drivers. More info and how to install hardware acceleration [here](https://wiki.archlinux.org/index.php/Hardware_video_acceleration).

## Installation

### Ubuntu
Having enabled universe repo run:
```
sudo apt install npm nodejs ffmpeg
```
Ubuntu is shipping wrong npm version for some reason.<br>
Update it and clear bash cache:
```
sudo npm install -g npm
hash -r
```

### Fedora
Having enabled rpm fusion repos run:
```
sudo dnf install npm nodejs ffmpeg
```

### Arch
```
sudo pacman -S npm nodejs ffmpeg
```

### Nautilus integration (optional)
* Ubuntu: `sudo apt install python-nautilus python3-gi`
* Fedora: `sudo dnf install nautilus-python python3-gobject`
* Arch: `sudo pacman -S python-nautilus python-gobject`

Older Fedora releases also require `pygobject3`.

## Install npm dependencies
**Before using extension** you also **must** install some additional npm packages.

You should also repeat this step when updating the extension to the new version, otherwise you may not have newly added or updated dependencies.

### New method
In version 9 and later this can be done from extension preferences.<br>
Go to `Cast Settings -> Modules` and click `Install npm modules` button.

You must have `npm` and `nodejs` installed prior to this step.

### Old method
Run below code in terminal:
```
cd ~/.local/share/gnome-shell/extensions/cast-to-tv@rafostar.github.com
npm install
```

## How to use
Detailed instructions related to configuration and using the extension are in the [wiki](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki).<br>
You can also find some usage examples and firewall config there.

Check out [FAQ](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki/FAQ), before asking questions.

## Info for translators
Preferred translation method is to use [Cast to TV Crowdin](https://crowdin.com/project/cast-to-tv) web page.

Crowdin does not require any additional tools and translating can be done through web browser. You can login using GitHub account or create a new one. Only I can add new languages to this project, so if your language is not available, please contact me first (you can leave comment [here](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/issues/29)).

Alternatively you can still use Makefile and tools like Poedit to generate translations:

`make potfile` - generates updated POT file.<br>
`make mergepo` - merges changes from POT file into all PO files.<br>
`make compilemo` - compiles translation files.<br>

After compiling restart gnome-shell for changes to be applied.

## Special Thanks
Special thanks go to [Simon Kusterer (xat)](https://github.com/xat) for developing [chromecast-player](https://github.com/xat/chromecast-player) and [Sam Potts](https://github.com/sampotts) for making [Plyr](https://github.com/sampotts/plyr), an awesome HTML5 video player.

### Nautilus Extension
Many thanks to [Rendy Anthony](https://github.com/rendyanthony) for helping me make Nautilus integration based on his [nautilus-cast](https://github.com/rendyanthony/nautilus-cast) extension.

### Translations
Many thanks to everyone involved in translating this extension either through GitHub or Crowdin.

## Donation
If you like my work please support it by buying me a cup of coffee :-)

[![PayPal](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv/wiki/images/paypal.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
