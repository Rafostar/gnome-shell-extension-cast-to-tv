const { Clutter, GObject } = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const Config = imports.misc.config;

const IS_OLD_SHELL = (Config.PACKAGE_VERSION.split('.')[1] < 33);

var AltPopupBase = (IS_OLD_SHELL) ?
	class AltPopupBase extends PopupMenu.PopupBaseMenuItem
	{
		constructor()
		{
			super({ hover: false });
			this.actor.add_style_pseudo_class = () => { return null };
		}
	} :
	GObject.registerClass(
	class AltPopupBase extends PopupMenu.PopupBaseMenuItem
	{
		_init()
		{
			super._init({ hover: false });

			if(this.hasOwnProperty('actor'))
				this.actor.add_style_pseudo_class = () => { return null };
			else
				this.add_style_pseudo_class = () => { return null };
		}
	});

AltPopupBase.prototype._onButtonReleaseEvent = function(actor, event)
{
	return Clutter.EVENT_STOP;
}

var AltPopupImage = (IS_OLD_SHELL) ?
	class AltPopupImage extends PopupMenu.PopupImageMenuItem
	{
		constructor(text, icon)
		{
			super(text, icon);
			/* Default temporary action for override */
			this._onItemClicked = () => { return null };
		}
	} :
	GObject.registerClass(
	class AltPopupImage extends PopupMenu.PopupImageMenuItem
	{
		_init(text, icon)
		{
			super._init(text, icon);
			this._onItemClicked = () => { return null };
		}
	});

AltPopupImage.prototype._onButtonReleaseEvent = function(actor, event)
{
	actor.remove_style_pseudo_class('active');
	this._onItemClicked();
	return Clutter.EVENT_STOP;
}
