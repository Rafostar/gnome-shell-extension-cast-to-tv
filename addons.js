const Main = imports.ui.main;
const AggregateMenu = Main.panel.statusArea.aggregateMenu;

function findCastToTv()
{
	let menuItems = AggregateMenu.menu._getMenuItems();
	let index = 0;

	while(index < menuItems.length)
	{
		if(menuItems[index].castSubMenu) break;
		index++;
	}

	if(menuItems[index]) return menuItems[index];
	else return null;
}

function setLastMenuItem(extMenu, item, endOffset)
{
	if(!endOffset) endOffset = 0;

	let subMenuItems = extMenu.castSubMenu.menu._getMenuItems();
	let lastItemIndex = subMenuItems.length - 1;
	extMenu.castSubMenu.menu.moveMenuItem(item, lastItemIndex - endOffset);
}
