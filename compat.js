const { Clutter, GObject } = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const Config = imports.misc.config;

const GNOME_MINOR_VER = Object.assign(Config.PACKAGE_VERSION).split('.')[1];

var PopupBase = (GNOME_MINOR_VER >= 31) ?
	GObject.registerClass(
	class extends PopupMenu.PopupBaseMenuItem
	{
		_init()
		{
			super._init({ hover: false });

			if(this.hasOwnProperty('actor'))
				this.actor.add_style_pseudo_class = () => { return null };
			else
				this.add_style_pseudo_class = () => { return null };
		}
	}) :
	class extends PopupMenu.PopupBaseMenuItem
	{
		constructor()
		{
			super({ hover: false });
			this.actor.add_style_pseudo_class = () => { return null };
		}
	}

PopupBase.prototype._onButtonReleaseEvent = function(actor, event)
{
	return Clutter.EVENT_STOP;
}
