const { GLib } = imports.gi;
const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;

let castMenu;
let addonMenuItems = {};
let timeouts = {};

function findCastToTv()
{
	let menuItems = AggregateMenu.menu._getMenuItems();
	let index = 0;

	while(index < menuItems.length)
	{
		if(	menuItems[index].hasOwnProperty('extensionId')
			&& menuItems[index].extensionId === 'cast-to-tv'
		) {
			return menuItems[index];
		}

		index++;
	}

	return null;
}

function setLastMenuItem(extMenu, item, endOffset)
{
	if(!endOffset) endOffset = 0;

	let subMenuItems = extMenu.castSubMenu.menu._getMenuItems();
	let lastItemIndex = subMenuItems.length - 1;
	extMenu.castSubMenu.menu.moveMenuItem(item, lastItemIndex - endOffset);
}

function enableAddon(addonName, Widget, delay)
{
	if(!addonName || !Widget) return;

	if(isNaN(delay))
		delay = 1000;

	if(!timeouts[addonName])
	{
		/* Give main extension time to finish startup */
		timeouts[addonName] = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () =>
		{
			timeouts[addonName] = null;

			castMenu = findCastToTv();
			if(castMenu)
			{
				addonMenuItems[addonName] = new Widget.addonMenuItem();
				castMenu.castSubMenu.menu.addMenuItem(addonMenuItems[addonName]);

				if(	castMenu.hasOwnProperty('isServiceEnabled')
					&& castMenu.isServiceEnabled === false
				) {
					if(addonMenuItems[addonName].hasOwnProperty('actor'))
						addonMenuItems[addonName].actor.hide();
					else
						addonMenuItems[addonName].hide();
				}

				if(castMenu.hasOwnProperty('serviceMenuItem'))
					setLastMenuItem(castMenu, castMenu.serviceMenuItem);

				if(castMenu.hasOwnProperty('settingsMenuItem'))
					setLastMenuItem(castMenu, castMenu.settingsMenuItem);
			}

			return GLib.SOURCE_REMOVE;
		});
	}
}

function disableAddon(addonName)
{
	if(timeouts[addonName])
	{
		GLib.source_remove(timeouts[addonName]);
		timeouts[addonName] = null;
	}

	if(addonMenuItems[addonName])
	{
		/* No need to reorder menu items when locking screen,
		as whole cast menu will be destroyed then anyway */
		let lockingScreen = (Main.sessionMode.currentMode == 'unlock-dialog'
			|| Main.sessionMode.currentMode == 'lock-screen');

		if(!lockingScreen && castMenu)
			setLastMenuItem(castMenu, addonMenuItems[addonName]);

		addonMenuItems[addonName].destroy();
		addonMenuItems[addonName] = null;
	}
}
