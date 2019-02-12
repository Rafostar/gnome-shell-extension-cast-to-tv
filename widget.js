const St = imports.gi.St;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const Lang = imports.lang;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Spawn = Local.imports.spawn;
const Temp = Local.imports.temp;
const iconName = 'tv-symbolic';

var sliderChanged;
var isRepeatActive;
var seekTime;

var statusIcon = new St.Icon({
	icon_name: iconName,
	style_class: 'system-status-icon'
});

var CastToTvMenu = new Lang.Class
({
	Name: 'Cast to TV',
	Extends: PopupMenu.PopupSubMenuMenuItem,

	_init: function()
	{
		this.parent(_("Cast Media"), true);
		this.icon.icon_name = iconName;

		/* Expandable menu */
		this.videoMenuItem = new PopupMenu.PopupImageMenuItem(_("Video"), 'folder-videos-symbolic');
		this.musicMenuItem = new PopupMenu.PopupImageMenuItem(_("Music"), 'folder-music-symbolic');
		this.pictureMenuItem = new PopupMenu.PopupImageMenuItem(_("Picture"), 'folder-pictures-symbolic');
		this.settingsMenuItem = new PopupMenu.PopupMenuItem(_("Cast Settings"));

		/* Assemble all menu items */
		this.menu.addMenuItem(this.videoMenuItem);
		this.menu.addMenuItem(this.musicMenuItem);
		this.menu.addMenuItem(this.pictureMenuItem);
		this.menu.addMenuItem(this.settingsMenuItem);

		/* Signals connections */
		this.videoMenuItem.connect('activate', Spawn.fileChooser.bind(this, 'VIDEO'));
		this.musicMenuItem.connect('activate', Spawn.fileChooser.bind(this, 'MUSIC'));
		this.pictureMenuItem.connect('activate', Spawn.fileChooser.bind(this, 'PICTURE'));
		this.settingsMenuItem.connect('activate', Spawn.extensionPrefs.bind(this));
	},

	destroy: function()
	{
		this.parent();
	}
});

var CastRemoteMenu = new Lang.Class
({
	Name: 'Cast to TV Remote',
	Extends: PanelMenu.Button,

	_init: function()
	{
		this.parent(0.5, _("Chromecast Remote"), false);

		this.box = new St.BoxLayout();
		this.icon = new St.Icon({ icon_name: 'input-dialpad-symbolic', style_class: 'system-status-icon' });
		this.toplabel = new St.Label({ text: _("Chromecast Remote"), y_expand: true, y_align: Clutter.ActorAlign.CENTER });

		/* Display app icon, label and dropdown arrow */
		this.box.add(this.icon);
		this.box.add(this.toplabel);
		this.box.add(PopupMenu.arrowIcon(St.Side.BOTTOM));

		this.actor.add_child(this.box);

		/* Create base for media control buttons */
		this.popupBase = new PopupBase;

		this.controlsButtonBox = new St.BoxLayout({
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true
		});

		this.trackTitle = new trackTitleItem();
		this.positionSlider = new SliderItem('folder-videos-symbolic');
		this.playButton = new MediaControlButton('media-playback-start-symbolic');
		this.pauseButton = new MediaControlButton('media-playback-pause-symbolic');
		this.stopButton = new MediaControlButton('media-playback-stop-symbolic');
		this.seekBackwardButton = new MediaControlButton('media-seek-backward-symbolic');
		this.seekForwardButton = new MediaControlButton('media-seek-forward-symbolic');
		this.skipBackwardButton = new MediaControlButton('media-skip-backward-symbolic');
		this.skipForwardButton = new MediaControlButton('media-skip-forward-symbolic');
		this.repeatButton = new MediaControlButton('media-playlist-repeat-symbolic', true);

		/* Add space between stop and the remaining buttons */
		this.stopButton.style = 'padding: 0px, 6px, 0px, 6px; margin-left: 2px; margin-right: 46px;';

		/* Assemble playback controls */
		this.controlsButtonBox.add(this.repeatButton);
		this.controlsButtonBox.add(this.stopButton);
		this.controlsButtonBox.add(this.skipBackwardButton);
		this.controlsButtonBox.add(this.seekBackwardButton);
		this.controlsButtonBox.add(this.playButton);
		this.controlsButtonBox.add(this.pauseButton);
		this.controlsButtonBox.add(this.seekForwardButton);
		this.controlsButtonBox.add(this.skipForwardButton);

		this.menu.addMenuItem(this.trackTitle);
		this.menu.addMenuItem(this.positionSlider);
		this.popupBase.actor.add(this.controlsButtonBox);
		this.menu.addMenuItem(this.popupBase);

		/* We do not want to display both play and pause buttons at once */
		this.playButton.hide();

		/* Signals connections */
		this.positionSlider.connect('value-changed', this._onSliderChange.bind(this));
		this.playButton.connect('clicked', Temp.setRemoteAction.bind(this, 'PLAY', ''));
		this.pauseButton.connect('clicked', Temp.setRemoteAction.bind(this, 'PAUSE', ''));
		this.seekForwardButton.connect('clicked', Temp.setRemoteAction.bind(this, 'SEEK+', seekTime));
		this.seekBackwardButton.connect('clicked', Temp.setRemoteAction.bind(this, 'SEEK-', seekTime));
		this.repeatButton.connect('clicked', this._onRepeatClick.bind(this));
		this.stopButton.connect('clicked', Temp.setRemoteAction.bind(this, 'STOP', ''));
		this.skipBackwardButton.connect('clicked', Temp.setRemoteAction.bind(this, 'SKIP-', ''));
		this.skipForwardButton.connect('clicked', Temp.setRemoteAction.bind(this, 'SKIP+', ''));
	},

	_onSliderChange: function()
	{
		Temp.setRemoteAction('SEEK', this.positionSlider.value.toFixed(3));
		sliderChanged = true;
	},

	_onRepeatClick: function()
	{
		Temp.setRemoteAction('REPEAT', this.repeatButton.turnedOn);
		isRepeatActive = this.repeatButton.turnedOn;
	},

	set label(value)
	{
		this.toplabel.text = value;
	},

	set title(value)
	{
		this.trackTitle.text = value;
	},

	set sliderIcon(value)
	{
		this.positionSlider.icon = value;
	},

	set skipBackwardsReactive(value)
	{
		this.skipBackwardButton.reactive = value;
	},

	set skipForwardReactive(value)
	{
		this.skipForwardButton.reactive = value;
	},

	setSliderValue: function(value)
	{
		this.positionSlider.setValue(value);
	},

	setPlaying: function(value)
	{
		if(value === true)
		{
			this.playButton.hide();
			this.pauseButton.show();
		}
		else if(value === false)
		{
			this.pauseButton.hide();
			this.playButton.show();
		}
	},

	enableRepeat: function(value)
	{
		this.repeatButton.turnOn(value);
	},

	setMode: function(value)
	{
		switch(value)
		{
			case 'DIRECT':
				this.positionSlider.show();
				this.repeatButton.show();
				this.pauseButton.show();
				this.playButton.hide();
				this.seekBackwardButton.show();
				this.seekForwardButton.show();
				break;
			case 'ENCODE':
				this.positionSlider.hide();
				this.repeatButton.show();
				this.pauseButton.show();
				this.playButton.hide();
				this.seekBackwardButton.hide();
				this.seekForwardButton.hide();
				break;
			case 'PICTURE':
				this.positionSlider.hide();
				this.repeatButton.hide();
				this.pauseButton.hide();
				this.playButton.hide();
				this.seekBackwardButton.hide();
				this.seekForwardButton.hide();
				break;
		}
	},

	hide: function()
	{
		this.actor.hide();
	},

	show: function()
	{
		this.actor.show();
	},

	destroy: function()
	{
		this.parent();
	}
});

var PopupBase = new Lang.Class({
	Name: "PopupBase",
	Extends: PopupMenu.PopupBaseMenuItem,

	_init: function()
	{
		this.parent({ hover: false, reactive: true });
		this.actor.add_style_pseudo_class = function() { return null; };
	}
});

var MediaControlButton = GObject.registerClass({
	GTypeName: 'MediaControlButton'
}, class MediaControlButton extends St.Button {
	_init(buttonIconName, toggle)
	{
		super._init({
			style: 'padding: 4px, 6px, 4px, 6px; margin-left: 2px; margin-right: 2px;',
			opacity: 130,
			child: new St.Icon({
				icon_name: buttonIconName,
				icon_size: 20
			})
		});

		this._turnedOn = false;

		let callback = () => {
			if(!this._turnedOn) this.opacity = !this.reactive ? 30 : this.hover ? 255 : 130;
			else this.opacity = 255;
		};

		let changeState = () => {
			if(toggle)
			{
				this._turnedOn = !this._turnedOn;
				if(this._turnedOn) this.opacity = 255;
				else this.opacity = 130;
			}
		};

		let signalIds = [
			this.connect('notify::hover', callback),
			this.connect('notify::reactive', callback),
			this.connect('clicked', changeState),
			this.connect('destroy', () => {
				signalIds.forEach(signalId => this.disconnect(signalId));
				this._turnedOn = null;
			})
		];
	}

	get turnedOn()
	{
		return this._turnedOn;
	}

	turnOn(value)
	{
		if(value === true)
		{
			this.opacity = 255;
			this._turnedOn = true;
		}
		else if(value === false)
		{
			this.opacity = 130;
			this._turnedOn = false;
		}
	}
});

var SliderItem = new Lang.Class({
	Name: "SliderItem",
	Extends: PopupMenu.PopupBaseMenuItem,

	_init: function(icon)
	{
		this.parent({ hover: false, reactive: true });
		this._icon = new St.Icon({ style_class: 'popup-menu-icon', icon_name: icon });
		this._slider = new Slider.Slider(0);

		this.actor.add(this._icon);
		this.actor.add(this._slider.actor, { expand: true });
		this.actor.add_style_pseudo_class = function(){ return null; };
	},

	get value()
	{
		return this._slider.value;
	},

	set icon(value)
	{
		this._icon.icon_name = value;
	},

	setValue: function(value)
	{
		this._slider.setValue(value);
	},

	hide: function()
	{
		this.actor.hide();
	},

	show: function()
	{
		this.actor.show();
	},

	connect: function(signal, callback)
	{
		this._slider.connect(signal, callback);
	}
});

var trackTitleItem = new Lang.Class({
	Name: "TrackTitleItem",
	Extends: PopupMenu.PopupBaseMenuItem,

	_init: function()
	{
		this.parent({ hover: false, reactive: true });
		this._title = new St.Label({ text: "", x_align: Clutter.ActorAlign.CENTER, x_expand: true });

		this.actor.add(this._title);
		this.actor.add_style_pseudo_class = function(){ return null; };
	},

	set text(value)
	{
		this._title.text = value;
	},
});
