const { GLib, St, Clutter, GObject } = imports.gi;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const ExtUtils = imports.misc.extensionUtils;
const Local = ExtUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const { AltPopupBase, IS_OLD_SHELL } = Local.imports.compat;
const Soup = Local.imports.soup;
const Playlist = Local.imports.playlist;
const Temp = Local.imports.temp;
const Helper = Local.imports.helper;
const _ = Gettext.gettext;

const UTILS_OPEN_PREFS = (
	ExtUtils.hasOwnProperty('openPrefs')
	&& typeof ExtUtils.openPrefs === 'function'
);
const ICON_NAME = 'tv-symbolic';
const MIN_DELAY = 3;
const MAX_DELAY = 5;

var remoteNames = {
	chromecast: {},
	playercast: null,
	browser: null
};

var statusIcon = new St.Icon({ icon_name: ICON_NAME, style_class: 'system-status-icon' });

var CastMainMenu = class extends PopupMenu.PopupMenuSection
{
	constructor()
	{
		super();

		this.extensionId = Local.metadata['extension-id'];
		this.castSubMenu = new PopupMenu.PopupSubMenuMenuItem(_("Cast Off"), true);
		this.castSubMenu.icon.icon_name = ICON_NAME;
		this.isServiceEnabled = false;

		/* Expandable menu */
		this.videoMenuItem = new PopupMenu.PopupImageMenuItem(_("Video"), 'folder-videos-symbolic');
		this.musicMenuItem = new PopupMenu.PopupImageMenuItem(_("Music"), 'folder-music-symbolic');
		this.pictureMenuItem = new PopupMenu.PopupImageMenuItem(_("Picture"), 'folder-pictures-symbolic');
		this.serviceMenuItem = new PopupMenu.PopupMenuItem(_("Turn On"));
		this.settingsMenuItem = new PopupMenu.PopupMenuItem(_("Cast Settings"));

		/* Assemble all menu items */
		this.castSubMenu.menu.addMenuItem(this.videoMenuItem);
		this.castSubMenu.menu.addMenuItem(this.musicMenuItem);
		this.castSubMenu.menu.addMenuItem(this.pictureMenuItem);
		this.castSubMenu.menu.addMenuItem(this.serviceMenuItem);
		this.castSubMenu.menu.addMenuItem(this.settingsMenuItem);

		/* Start with turned off state with media items hidden */
		let mediaItems = ['videoMenuItem', 'musicMenuItem', 'pictureMenuItem'];
		mediaItems.forEach(item =>
		{
			if(this[item].hasOwnProperty('actor'))
				this[item].actor.hide();
			else
				this[item].hide();
		});

		/* Signals connections */
		this.videoSignal = this.videoMenuItem.connect('activate', this.spawnFileChooser.bind(this, 'VIDEO'));
		this.musicSignal = this.musicMenuItem.connect('activate', this.spawnFileChooser.bind(this, 'MUSIC'));
		this.pictureSignal = this.pictureMenuItem.connect('activate', this.spawnFileChooser.bind(this, 'PICTURE'));
		this.settingsSignal = this.settingsMenuItem.connect('activate', this.spawnExtensionPrefs.bind(this));

		/* Add menu item */
		this.addMenuItem(this.castSubMenu);
	}

	spawnFileChooser(streamType)
	{
		Helper.startApp(Local.path, 'file-chooser', [streamType]);
	}

	spawnExtensionPrefs()
	{
		if(UTILS_OPEN_PREFS)
			return ExtUtils.openPrefs();

		/* Open extension preferences (pre-3.36) */
		GLib.spawn_async('/usr/bin', ['gnome-shell-extension-prefs',
			'cast-to-tv@rafostar.github.com'], null, 0, null);
	}

	enableFullMenu(enable)
	{
		let menuItems = this.castSubMenu.menu._getMenuItems();

		if(enable)
		{
			menuItems.forEach(item =>
			{
				if(item.hasOwnProperty('actor'))
					item.actor.show();
				else
					item.show();
			});

			this.serviceMenuItem.label.text = _("Turn Off");
			this.castSubMenu.label.text = _("Cast Media");
		}
		else
		{
			menuItems.forEach(item =>
			{
				if(
					item !== this.serviceMenuItem
					&& item !== this.settingsMenuItem
				) {
					if(item.hasOwnProperty('actor'))
						item.actor.hide();
					else
						item.hide();
				}
			});

			this.serviceMenuItem.label.text = _("Turn On");
			/* TRANSLATORS: When "Cast Media" service is turned off */
			this.castSubMenu.label.text = _("Cast Off");
		}

		this.isServiceEnabled = enable;
	}

	destroy()
	{
		this.videoMenuItem.disconnect(this.videoSignal);
		this.musicMenuItem.disconnect(this.musicSignal);
		this.pictureMenuItem.disconnect(this.pictureSignal);
		this.settingsMenuItem.disconnect(this.settingsSignal);

		super.destroy();
	}
}

var CastRemoteMenu = GObject.registerClass(
class CastRemoteMenu extends PanelMenu.Button
{
	_init(opts)
	{
		super._init(0.5, "Cast to TV Remote", false);

		this.opts = opts;
		this.isActor = (this.hasOwnProperty('actor'));
		this.currentProgress = 0;
		this.currentVolume = 1;

		this.box = new St.BoxLayout();
		this.icon = new St.Icon({
			icon_name: 'input-dialpad-symbolic',
			style_class: 'system-status-icon'
		});
		this.toplabel = new St.Label({
			y_expand: true,
			y_align: Clutter.ActorAlign.CENTER
		});
		this.barArrowIcon = PopupMenu.arrowIcon(St.Side.BOTTOM);

		/* Display app icon, label and dropdown arrow */
		this.box.add_actor(this.icon);
		this.box.add_actor(this.toplabel);
		this.box.add_actor(this.barArrowIcon);

		if(this.isActor)
			this.actor.add_child(this.box);
		else
			this.add_child(this.box);

		/* Create base for media control buttons */
		this.popupBase = new AltPopupBase();

		this.controlsButtonBox = new St.BoxLayout({
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true
		});

		this.trackTitle = new CastTitleItem();
		this.positionSlider = new CastSliderItem('folder-videos-symbolic', this.opts.isUnifiedSlider, false);
		this.volumeSlider = new CastSliderItem('audio-volume-high-symbolic', false, true);
		this.togglePlayButton = new CastControlButton('media-playback-pause-symbolic');
		this.stopButton = new CastControlButton('media-playback-stop-symbolic');
		this.seekBackwardButton = new CastControlButton('media-seek-backward-symbolic');
		this.seekForwardButton = new CastControlButton('media-seek-forward-symbolic');
		this.skipBackwardButton = new CastControlButton('media-skip-backward-symbolic');
		this.skipForwardButton = new CastControlButton('media-skip-forward-symbolic');
		this.repeatButton = new CastControlButton('media-playlist-repeat-symbolic', true);
		this.slideshowButton = new CastControlButton('camera-photo-symbolic', true);
		this.playlist = new Playlist.CastPlaylist();

		/* Add space between stop and the remaining buttons */
		this.stopButton.style = 'padding: 0px, 6px, 0px, 6px; margin-left: 2px; margin-right: 46px;';

		/* Assemble playback controls */
		this.controlsButtonBox.add_actor(this.slideshowButton);
		this.controlsButtonBox.add_actor(this.repeatButton);
		this.controlsButtonBox.add_actor(this.stopButton);
		this.controlsButtonBox.add_actor(this.skipBackwardButton);
		this.controlsButtonBox.add_actor(this.seekBackwardButton);
		this.controlsButtonBox.add_actor(this.togglePlayButton);
		this.controlsButtonBox.add_actor(this.seekForwardButton);
		this.controlsButtonBox.add_actor(this.skipForwardButton);

		this.menu.addMenuItem(this.trackTitle);
		this.menu.addMenuItem(this.positionSlider);
		this.menu.addMenuItem(this.volumeSlider);

		if(this.popupBase.hasOwnProperty('actor'))
			this.popupBase.actor.add_actor(this.controlsButtonBox);
		else
			this.popupBase.add_actor(this.controlsButtonBox);

		this.menu.addMenuItem(this.popupBase);
		this.menu.addMenuItem(this.playlist.subMenu);

		/* Toggle play button stores pause state */
		this.togglePlayButton.isPause = true;

		this.slideshowButton._signalIds.push(
			this.slideshowButton.connect('clicked', () =>
			{
				this.repeatButton.reactive = this.slideshowButton.turnedOn;
				Soup.client.postRemote('SLIDESHOW', this.slideshowButton.turnedOn);
			})
		);
		this.repeatButton._signalIds.push(
			this.repeatButton.connect('clicked', () =>
			{
				Soup.client.postRemote('REPEAT', this.repeatButton.turnedOn);
			})
		);
		this.togglePlayButton._signalIds.push(
			this.togglePlayButton.connect('clicked', () =>
			{
				let toggleAction = (this.togglePlayButton.isPause) ? 'PAUSE' : 'PLAY';
				Soup.client.postRemote(toggleAction);
			})
		);
		this.seekForwardButton._signalIds.push(
			this.seekForwardButton.connect('clicked', () => Soup.client.postRemote('SEEK+', this.opts.seekTime))
		);
		this.seekBackwardButton._signalIds.push(
			this.seekBackwardButton.connect('clicked', () => Soup.client.postRemote('SEEK-', this.opts.seekTime))
		);
		this.stopButton._signalIds.push(
			this.stopButton.connect('clicked', () => Soup.client.postRemote('STOP'))
		);
		this.skipBackwardButton._signalIds.push(
			this.skipBackwardButton.connect('clicked', () => Soup.client.postRemote('SKIP-'))
		);
		this.skipForwardButton._signalIds.push(
			this.skipForwardButton.connect('clicked', () => Soup.client.postRemote('SKIP+'))
		);

		this.connectSliderSignals('positionSlider');
		this.connectSliderSignals('volumeSlider');
		this.setMode(this.opts.mode, null, true);
		this.setMediaButtonsSize(this.opts.mediaButtonsSize);
		this.setSlidersIconSize(this.opts.sliderIconSize);
		this.setUnifiedSlider(this.opts.isUnifiedSlider);

		if(this.opts.isLabel)
			this.refreshLabel();
		else
		{
			this.toplabel.hide();
			this.barArrowIcon.hide();
		}

		/* Hide remote by default */
		(this.isActor) ? this.actor.hide() : this.hide();
	}

	sliderAction(sliderName)
	{
		this[sliderName].delay = MIN_DELAY;
		let action = (this[sliderName].isVolume) ? 'VOLUME' : 'SEEK';
		let value = this[sliderName].getValue();

		Soup.client.postRemote(action, value, () => this[sliderName].busy = false);
	}

	refreshSliders()
	{
		if(this.positionSlider.isVolume)
		{
			this.positionSlider.setIcon(this.positionSlider.volumeIcon);
			this.positionSlider.setValue(this.currentVolume);
		}
		else
		{
			this.positionSlider.setIcon(this.positionSlider.defaultIcon);
			this.positionSlider.setValue(this.currentProgress);
		}
	}

	sliderButtonAction()
	{
		this.positionSlider.isVolume ^= true;
		this.refreshSliders();
	}

	connectSliderSignals(sliderName)
	{
		if(this[sliderName]._slider.hasOwnProperty('actor'))
		{
			this[sliderName]._actorSignalIds.push(
				this[sliderName]._slider.actor.connect('scroll-event', () => {
					this[sliderName].delay = MAX_DELAY
				})
			);
		}
		else
		{
			this[sliderName]._signalIds.push(
				this[sliderName]._slider.connect('scroll-event', () => {
					this[sliderName].delay = MAX_DELAY
				})
			);
		}

		this[sliderName]._signalIds.push(
			this[sliderName]._slider.connect('drag-begin', () => this[sliderName].busy = true)
		);
		this[sliderName]._signalIds.push(
			this[sliderName]._slider.connect('drag-end', this.sliderAction.bind(this, sliderName))
		);

		if(sliderName === 'positionSlider')
		{
			this[sliderName]._sliderButton._signalIds.push(
				this[sliderName]._sliderButton.connect('clicked', this.sliderButtonAction.bind(this))
			);
		}
	}

	handleSliderDelay(sliderName)
	{
		this[sliderName].delay--;

		if(!this[sliderName].busy && this[sliderName].delay === MIN_DELAY)
			this.sliderAction(sliderName);
	}

	refreshLabel()
	{
		/* Change remote label */
		switch(this.opts.receiverType)
		{
			case 'chromecast':
				if(this.opts.useFriendlyName && remoteNames.chromecast.friendlyName)
					this.toplabel.text = remoteNames.chromecast.friendlyName;
				else
					this.toplabel.text = "Chromecast";
				break;
			case 'playercast':
				if(this.opts.useFriendlyName && remoteNames.playercast)
					this.toplabel.text = remoteNames.playercast;
				else
					this.toplabel.text = "Playercast";
				break;
			case 'other':
				/* TRANSLATORS: Web browser label for top bar remote */
				if(this.opts.useFriendlyName && remoteNames.browser)
					this.toplabel.text = remoteNames.browser;
				else
					this.toplabel.text = _("Browser");
				break;
			default:
				break;
		}
	}

	updateRemote(status)
	{
		if(!status) return;

		if(
			status.hasOwnProperty('repeat')
			&& this.repeatButton.turnedOn !== status.repeat
		) {
			this.repeatButton.turnOn(status.repeat);
		}

		if(
			this.opts.mode === 'PICTURE'
			&& status.hasOwnProperty('slideshow')
			&& this.slideshowButton.turnedOn !== status.slideshow
		) {
			this.slideshowButton.turnOn(status.slideshow);
			this.repeatButton.reactive = status.slideshow;
		}

		if(this.opts.mode === 'PICTURE') return;

		if(status.mediaDuration > 0 && status.currentTime <= status.mediaDuration)
			this.currentProgress = status.currentTime / status.mediaDuration;

		this.currentVolume = status.volume;
		this.checkPlaying(status);

		if(this.positionSlider.delay > 0)
			this.handleSliderDelay('positionSlider');

		if(this.volumeSlider.delay > 0)
			this.handleSliderDelay('volumeSlider');

		if(status.volume >= 0 && status.volume <= 1)
			this.setVolumeCheck();

		this.setProgressCheck();
	}

	setPlaying(isPlaying)
	{
		if(this.togglePlayButton.isPause === isPlaying)
			return;

		let name = (isPlaying) ? 'pause' : 'start';

		this.togglePlayButton.setIcon('media-playback-' + name + '-symbolic');
		this.togglePlayButton.isPause = isPlaying;
	}

	checkPlaying(status)
	{
		if(status.playerState == 'PLAYING')
			this.setPlaying(true);
		else if(status.playerState == 'PAUSED')
			this.setPlaying(false);
	}

	setProgressCheck()
	{
		if(
			this.positionSlider.getVisible()
			&& !this.positionSlider.isVolume
			&& this.positionSlider.delay == 0
			&& !this.positionSlider.busy
		) {
			this.positionSlider.setValue(this.currentProgress);
		}
	}

	setVolumeCheck()
	{
		if(
			this.volumeSlider.getVisible()
			&& this.volumeSlider.delay == 0
			&& !this.volumeSlider.busy
		) {
			this.volumeSlider.setValue(this.currentVolume);
		}
		else if(
			this.positionSlider.isVolume
			&& this.positionSlider.delay == 0
			&& !this.positionSlider.busy
		) {
			this.positionSlider.setValue(this.currentVolume);
		}
	}

	setMode(value, icon, force)
	{
		if(
			!force
			&& this.opts.mode === value
			&& (!icon || this.positionSlider.defaultIcon === icon)
		) {
			return;
		}

		this.opts.mode = value;
		let shownItems = [];

		/* Items that might be shown or hidden depending on media content */
		let changableItems = ['positionSlider', 'volumeSlider', 'togglePlayButton',
			'seekBackwardButton', 'seekForwardButton', 'repeatButton', 'slideshowButton'];

		switch(this.opts.mode)
		{
			case 'DIRECT':
				shownItems = ['positionSlider', 'repeatButton', 'togglePlayButton',
					'seekBackwardButton', 'seekForwardButton'];
				if(!this.opts.isUnifiedSlider) shownItems.push('volumeSlider');
				break;
			case 'ENCODE':
				shownItems = ['volumeSlider', 'repeatButton', 'togglePlayButton'];
				break;
			case 'PICTURE':
				shownItems = ['slideshowButton', 'repeatButton'];
				break;
			case 'LIVE':
				shownItems = ['volumeSlider'];
				break;
			default:
				break;
		}

		this.repeatButton.reactive = (this.opts.mode !== 'PICTURE') ? true
			: (this.slideshowButton.turnedOn) ? true : false;

		changableItems.forEach(item =>
		{
			let isActor = (this[item].hasOwnProperty('actor'));

			if(shownItems.includes(item))
			{
				if(isActor) this[item].actor.show();
				else this[item].show();
			}
			else
			{
				if(isActor) this[item].actor.hide();
				else this[item].hide();
			}
		});

		if(icon) this.positionSlider.defaultIcon = icon;

		Playlist.seekAllowed = (this.opts.mode === 'DIRECT') ? true : false;
	}

	setMediaButtonsSize(size)
	{
		this.opts.mediaButtonsSize = size;

		this.togglePlayButton.child.icon_size = size;
		this.stopButton.child.icon_size = size;
		this.seekBackwardButton.child.icon_size = size;
		this.seekForwardButton.child.icon_size = size;
		this.skipBackwardButton.child.icon_size = size;
		this.skipForwardButton.child.icon_size = size;
		this.repeatButton.child.icon_size = size;
		this.slideshowButton.child.icon_size = size;
	}

	setSlidersIconSize(size)
	{
		this.opts.sliderIconSize = size;

		this.positionSlider.setIconSize(size);
		this.volumeSlider.setIconSize(size);
	}

	setUnifiedSlider(isUnified)
	{
		this.opts.isUnifiedSlider = isUnified;

		if(this.volumeSlider.isActor)
		{
			if(isUnified)
				this.volumeSlider.actor.hide();
			else
				this.volumeSlider.actor.show();
		}
		else
		{
			if(isUnified)
				this.volumeSlider.hide();
			else
				this.volumeSlider.show();
		}

		this.positionSlider.setToggle(isUnified);

		if(!isUnified)
			this.positionSlider.isVolume = false;

		this.refreshSliders();
	}

	destroy()
	{
		this.playlist.destroy();
		super.destroy();
	}
});

var CastControlButton = GObject.registerClass(
class CastControlButton extends St.Button
{
	_init(icon, toggle, size)
	{
		if(!size) size = 20;

		super._init({
			style: 'padding: 4px, 6px, 4px, 6px; margin-left: 2px; margin-right: 2px;',
			opacity: 130,
			child: new St.Icon({ style_class: 'popup-menu-icon', icon_size: size, icon_name: icon })
		});

		this.turnedOn = false;

		let callback = () =>
		{
			this.opacity = (!this.reactive) ? 30 :
				(this.turnedOn || this.hover) ? 255 : 130;
		}

		let changeState = () =>
		{
			if(toggle)
			{
				this.turnedOn = !this.turnedOn;
				if(this.turnedOn) this.opacity = 255;
				else this.opacity = 130;
			}
		}

		this._signalIds = [
			this.connect('notify::hover', callback),
			this.connect('notify::reactive', callback),
			this.connect('clicked', changeState),
			this.connect('destroy', () => {
				this._signalIds.forEach(signalId => this.disconnect(signalId));
				this.turnedOn = null;
			})
		];
	}

	turnOn(value)
	{
		if(value) this.opacity = 255;
		else this.opacity = 130;

		this.turnedOn = value;
	}

	setIcon(iconName)
	{
		this.child.icon_name = iconName;
	}
});

var CastSliderItem = GObject.registerClass(
class CastSliderItem extends AltPopupBase
{
	_init(icon, toggle, isVolume)
	{
		super._init();

		this.defaultIcon = icon;
		this.volumeIcon = 'audio-volume-high-symbolic';
		this.delay = 0;
		this.busy = false;
		this.isVolume = isVolume || false;
		this.isActor = (this.hasOwnProperty('actor'));

		this._slider = new Slider.Slider(0);
		this._sliderIcon = new St.Icon({ style_class: 'popup-menu-icon', icon_size: 16, icon_name: icon });
		this._sliderButton = new CastControlButton(icon, false, 16);

		if(this.isActor)
		{
			this.actor.add_actor(this._sliderIcon);
			this.actor.add_actor(this._sliderButton);
			this.actor.add(this._slider.actor, { expand: true });
			this.actor.visible = true;
		}
		else
		{
			this.add_actor(this._sliderIcon);
			this.add_actor(this._sliderButton);

			if(IS_OLD_SHELL)
				this.add(this._slider, { expand: true });
			else
				this.add_child(this._slider);

			this.visible = true;
		}

		this._sliderIcon.style = 'margin-right: 2px;';
		this._sliderButton.style = 'margin-right: 2px;';
		(toggle) ? this._sliderIcon.hide() : this._sliderButton.hide();

		/* Actor signals for backward compatibility */
		this._actorSignalIds = [];

		/* Slider signals */
		this._signalIds = [];

		this.destroySignal = this.connect('destroy', () => {
			this.disconnect(this.destroySignal);
			this._signalIds.forEach(signalId => this._slider.disconnect(signalId));
			this._actorSignalIds.forEach(signalId => {
				if(this._slider.hasOwnProperty('actor'))
					this._slider.actor.disconnect(signalId);
			});
			this.turnedOn = null;
		});
	}

	getVisible()
	{
		return (this.isActor) ? this.actor.visible : this.visible;
	}

	setIconSize(size)
	{
		this._sliderButton.child.icon_size = size;
		this._sliderIcon.icon_size = size;
	}

	getValue()
	{
		return this._slider.value.toFixed(3);
	}

	setValue(value)
	{
		if(this._slider.setValue && typeof this._slider.setValue === 'function')
			this._slider.setValue(value);
		else
			this._slider.value = value;
	}

	setIcon(iconName)
	{
		this._sliderButton.child.icon_name = iconName;
		this._sliderIcon.icon_name = iconName;
	}

	setToggle(value)
	{
		if(value)
		{
			this._sliderIcon.hide();
			this._sliderButton.show();
		}
		else
		{
			this._sliderButton.hide();
			this._sliderIcon.show();
		}
	}
});

var CastTitleItem = GObject.registerClass(
class CastTitleItem extends AltPopupBase
{
	_init()
	{
		super._init();

		this._title = new St.Label({
			text: "",
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true
		});

		this.add_actor(this._title);
	}

	setText(text)
	{
		this._title.text = text;
	}
});
