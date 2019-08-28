const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const _ = Gettext.gettext;
const Temp = Local.imports.temp;

const PLAYLIST_MENU_ICON = 'view-list-symbolic';
const PLAYLIST_ITEM_ICON = 'open-menu-symbolic';
const TEMP_INSERT_ICON = 'insert-object-symbolic';

var CastPlaylist = class
{
	constructor()
	{
		this.subMenu = new CastPlaylistSubMenu();
		this.tempMenuItem = null;

		this._addMenuInsertItem();

		this._dragMonitor = {
			dragMotion: this._onDragMotion.bind(this)
		};

		DND.addDragMonitor(this._dragMonitor);
	}

	loadPlaylist(playlistArray)
	{
		/* Remove non-playlist items to make sorting easier */
		this.tempMenuItem.destroy();

		let menuItems = this.subMenu.menu._getMenuItems();

		/* Remove old items no longer in playlist */
		for(let menuItem of menuItems)
		{
			if(!playlistArray.includes(menuItem.filepath))
				menuItem.destroy();
		}

		/* Add new items to playlist */
		for(let listItem of playlistArray)
		{
			if(!this._isPathInMenu(listItem))
				this.addPlaylistItem(listItem);
		}

		/* Sort playlist */
		this._sortMenuItems(playlistArray);

		/* Restore non-playlist items */
		this._addMenuInsertItem();
	}

	addPlaylistItem(filepath, position)
	{
		let filename = filepath.substring(filepath.lastIndexOf('/') + 1);
		let title = (filename.includes('.')) ? filename.split('.').slice(0, -1).join('.') : filename;

		let playlistItem = new CastPlaylistItem(title, filepath);
		this._connectDragSigals(playlistItem);

		this.subMenu.menu.addMenuItem(playlistItem, position);
	}

	updatePlaylistFile()
	{
		let menuItems = this.subMenu.menu._getMenuItems();
		let filePlaylist = [];

		menuItems.forEach(listItem =>
		{
			if(listItem.hasOwnProperty('filepath'))
				filePlaylist.push(listItem.filepath);
		});

		if(!filePlaylist.length)
			filePlaylist = [''];

		Temp.setListFile(filePlaylist);
	}

	_addMenuInsertItem()
	{
		this.tempMenuItem = new CastTempPlaylistItem();
		this.subMenu.menu.addMenuItem(this.tempMenuItem);
	}

	_sortMenuItems(playlist)
	{
		let menuItems = this.subMenu.menu._getMenuItems();

		for(let i = 0; i < menuItems.length; i++)
		{
			if(	menuItems[i].filepath
				&& menuItems[i].filepath !== playlist[i]
				&& playlist.includes(menuItems[i].filepath)
			)
				this.subMenu.menu.moveMenuItem(menuItems[i], playlist.indexOf(menuItems[i].filepath));
		}
	}

	_isPathInMenu(searchPath)
	{
		let menuItems = this.subMenu.menu._getMenuItems();

		for(let menuItem of menuItems)
		{
			if(	menuItem.hasOwnProperty('filepath')
				&& menuItem.filepath === searchPath
			)
				return true;
		}

		return false;
	}

	_recreatePlaylist(playlistArray)
	{
		this.subMenu.menu.removeAll();

		playlistArray.forEach(filepath => this.addPlaylistItem(filepath));

		this._addMenuInsertItem();
	}

	_getHoverItem(targetItem, searchValue)
	{
		if(targetItem && typeof targetItem === 'object')
		{
			if(targetItem[searchValue])
			{
				/* targetItem is the target we are searching for */
				return targetItem;
			}
			else
			{
				/* Limit loop by max children depth of PopupImageMenuItem */
				let iterLimit = 2;

				while(	iterLimit--
					&& targetItem.get_parent
					&& typeof targetItem.get_parent === 'function'
				) {
					targetItem = targetItem.get_parent();

					if(targetItem.hasOwnProperty('_delegate'))
						targetItem = targetItem._delegate;

					if(targetItem[searchValue])
						return targetItem;
				}
			}
		}

		return null;
	}

	_connectDragSigals(menuItem)
	{
		/* Show placeholder item when dragging started */
		menuItem.drag.connect('drag-begin', () => this._onDragBegin(menuItem));

		/* Remove item when dragged anywhere besides playlist */
		menuItem.drag.connect('drag-cancelled', () => this._onDragCancelled(menuItem));

		/* Handle drop item response */
		menuItem.drag.connect('drag-end', this._onDragEnd.bind(this));
	}

	_onDragBegin(menuItem)
	{
		let menuItems = this.subMenu.menu._getMenuItems();

		this.subMenu.menu.moveMenuItem(this.tempMenuItem, menuItems.indexOf(menuItem));
		this.tempMenuItem.show();
	}

	_onDragCancelled(menuItem)
	{
		let menuItems = this.subMenu.menu._getMenuItems();

		if(menuItems.length > 1)
		{
			menuItem.destroy();
			this.tempMenuItem.hide();
			this.updatePlaylistFile();
		}
	}

	_onDragEnd(obj, time, res, meta)
	{
		let menuItems = this.subMenu.menu._getMenuItems();

		if(res && typeof meta === 'object')
		{
			let newPlaylistItem = new CastPlaylistItem(meta.text, meta.filepath);
			this._connectDragSigals(newPlaylistItem);

			this.subMenu.menu.addMenuItem(newPlaylistItem, menuItems.indexOf(this.tempMenuItem));
			this.updatePlaylistFile();
		}

		this.tempMenuItem.hide();
	}

	_onDragMotion(dragEvent)
	{
		let targetItem = (dragEvent.targetActor.hasOwnProperty('_delegate')) ?
			dragEvent.targetActor._delegate : dragEvent.targetActor;

		let menuItems = this.subMenu.menu._getMenuItems();
		let hoverItem = this._getHoverItem(targetItem, 'isPlaylistItem');

		if(hoverItem)
		{
			if(menuItems.indexOf(hoverItem) !== menuItems.indexOf(this.tempMenuItem))
				this.subMenu.menu.moveMenuItem(this.tempMenuItem, menuItems.indexOf(hoverItem));

			this.tempMenuItem.show();
		}
		else if(menuItems.length > 1 && !this._getHoverItem(targetItem, 'isTempPlaylistItem'))
		{
			this.tempMenuItem.hide();
		}

		return DND.DragMotionResult.CONTINUE;
	}

	destroy()
	{
		DND.removeDragMonitor(this._dragMonitor);

		this.subMenu.destroy();
	}
}

class CastPlaylistSubMenu extends PopupMenu.PopupSubMenuMenuItem
{
	constructor()
	{
		super(_("Playlist"), true);

		this.icon.icon_name = PLAYLIST_MENU_ICON;
	}

	destroy()
	{
		super.destroy();
	}
}

class CastPlaylistItem extends PopupMenu.PopupImageMenuItem
{
	constructor(title, filepath)
	{
		super(title, PLAYLIST_ITEM_ICON);

		this.isPlaylistItem = true;
		this.filepath = filepath;

		if(this.hasOwnProperty('actor'))
			this.drag = DND.makeDraggable(this.actor);
		else
			this.drag = DND.makeDraggable(this);
	}

	destroy()
	{
		super.destroy();
	}
}

class CastTempPlaylistItem extends PopupMenu.PopupImageMenuItem
{
	constructor()
	{
		super('', TEMP_INSERT_ICON);

		this.isTempPlaylistItem = true;

		if(this.hasOwnProperty('actor'))
		{
			this.show = () => this.actor.show();
			this.hide = () => this.actor.hide();
		}

		/* Hidden by default */
		this.hide();

		/* This function is called by DND */
		this.acceptDrop = (source, actor, x, y, time) =>
		{
			let dragItem = (actor.hasOwnProperty('_delegate')) ? actor._delegate : actor;

			dragItem.drag.emit('drag-end', 0, true,
				{ text: dragItem.label.text, filepath: dragItem.filepath });

			actor.destroy();
		}
	}

	destroy()
	{
		super.destroy();
	}
}
