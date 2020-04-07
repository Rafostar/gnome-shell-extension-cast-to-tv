const { Clutter, GObject } = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const Config = imports.misc.config;

var IS_OLD_SHELL = (Config.PACKAGE_VERSION.split('.')[1] < 35);

var AltPopupBase = GObject.registerClass(
class AltPopupBase extends PopupMenu.PopupBaseMenuItem
{
	_init()
	{
		super._init({ hover: false });
	}

	add_style_pseudo_class()
	{
		return null;
	}

	_onButtonReleaseEvent(actor, event)
	{
		return this.vfunc_button_release_event();
	}

	vfunc_button_release_event()
	{
		return Clutter.EVENT_STOP;
	}
});

var AltPopupImage = GObject.registerClass(
class AltPopupImage extends PopupMenu.PopupImageMenuItem
{
	_init(text, icon)
	{
		super._init(text, icon);
	}

	/* Default temporary action for override */
	_onItemClicked()
	{
		return null;
	}

	_onButtonReleaseEvent(actor, event)
	{
		return this.vfunc_button_release_event();
	}

	vfunc_button_release_event()
	{
		this.remove_style_pseudo_class('active');
		this._onItemClicked();
		return Clutter.EVENT_STOP;
	}
});
