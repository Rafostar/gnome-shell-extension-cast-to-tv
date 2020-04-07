const { Clutter, GObject } = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const { AltPopupImage } = Local.imports.compat;
const Soup = Local.imports.soup;
const _ = Gettext.gettext;

const PLAYLIST_MENU_ICON = 'view-list-symbolic';
const PLAYLIST_ITEM_INACTIVE_ICON = 'open-menu-symbolic';
const PLAYLIST_ITEM_ACTIVE_ICON = 'media-playback-start-symbolic';
const TEMP_INSERT_ICON = 'insert-object-symbolic';

var seekAllowed = true;

var CastPlaylist = class
{
	constructor()
	{
		this.subMenu = new CastPlaylistSubMenu();
		this.tempMenuItem = null;
		this.draggedItem = null;
		this.isDragging = false;
		this.remoteActive = false;

		this._addMenuInsertItem(false, 0);

		this._dragMonitor = {
			dragMotion: this._onDragMotion.bind(this),
			dragDrop: this._onDragDrop.bind(this)
		};

		DND.addDragMonitor(this._dragMonitor);
	}

	loadPlaylist(playlistArray, activeTrackPath)
	{
		let menuItems = this.subMenu.menu._getMenuItems();

		/* Remove old items no longer in playlist */
		for(let menuItem of menuItems)
		{
			if(menuItem.isPlaylistItem && menuItem.filepath)
			{
				if(!playlistArray.includes(menuItem.filepath))
					menuItem.destroy();
				else if(menuItem.isPlaying && menuItem.filepath !== activeTrackPath)
					menuItem.setPlaying(false);
				else if(!menuItem.isPlaying && menuItem.filepath === activeTrackPath)
					menuItem.setPlaying(true);
			}
		}

		/* Add new items to playlist */
		for(let filepath of playlistArray)
		{
			let isActive = (filepath === activeTrackPath) ? true : false;

			if(!this._isPathInMenu(filepath))
			{
				if(
					this.isDragging
					&& this.draggedItem
					&& this.draggedItem.filepath === filepath
				) {
					if(!this.draggedItem.isPlaying && isActive)
						this.draggedItem.setPlaying(true);
					else if(this.draggedItem.isPlaying && !isActive)
						this.draggedItem.setPlaying(false);
				}
				else
					this.addMenuPlaylistItem(filepath, isActive);
			}
		}

		/* Sort playlist */
		if(!this.isDragging) this.sortMenuItems(playlistArray);
	}

	addMenuPlaylistItem(filepath, isActive)
	{
		let title;

		if(filepath.startsWith('/'))
		{
			let filename = filepath.substring(filepath.lastIndexOf('/') + 1);
			title = (filename.includes('.')) ? filename.split('.').slice(0, -1).join('.') : filename;
		}
		else
			title = filepath;

		let playlistItem = new CastPlaylistItem(title, filepath);
		this._connectDragSigals(playlistItem);

		if(isActive) playlistItem.setPlaying(true);

		this.subMenu.menu.addMenuItem(playlistItem);
	}

	sortMenuItems(playlistArray)
	{
		let menuItems = this.subMenu.menu._getMenuItems();
		let isInsert = (this.tempMenuItem && menuItems.includes(this.tempMenuItem));
		let lastItemIndex = menuItems.length - 1;
		let insertItemIndex = 0;

		if(isInsert)
		{
			/* Get insert item index so it can be restored to the same place */
			insertItemIndex = menuItems.indexOf(this.tempMenuItem);

			/* If menu includes insert item, move it to the end and sort without it */
			this.subMenu.menu.moveMenuItem(this.tempMenuItem, lastItemIndex);
			menuItems = this.subMenu.menu._getMenuItems();

			lastItemIndex--;
		}

		for(let i = 0; i <= lastItemIndex; i++)
		{
			if(menuItems[i].filepath && menuItems[i].filepath !== playlistArray[i])
			{
				let foundItem = menuItems.find(obj => {
					return (obj.filepath && obj.filepath === playlistArray[i])
				});

				if(foundItem)
				{
					this.subMenu.menu.moveMenuItem(foundItem, i);
					menuItems = this.subMenu.menu._getMenuItems();
				}
			}
		}

		/* Restore non-playlist item position */
		if(isInsert) this.subMenu.menu.moveMenuItem(this.tempMenuItem, insertItemIndex);
	}

	updatePlaylistFile()
	{
		if(!this.remoteActive || !Soup.client)
			return;

		let menuItems = this.subMenu.menu._getMenuItems();
		let filePlaylist = [];

		menuItems.forEach(listItem =>
		{
			if(listItem.hasOwnProperty('filepath'))
				filePlaylist.push(listItem.filepath);
		});

		if(!filePlaylist.length)
			filePlaylist = [''];

		Soup.client.postPlaylist(filePlaylist);
	}

	_addMenuInsertItem(isShown, position)
	{
		this.tempMenuItem = new CastTempPlaylistItem(isShown);
		this.subMenu.menu.addMenuItem(this.tempMenuItem, position);
	}

	_isPathInMenu(searchPath)
	{
		let menuItems = this.subMenu.menu._getMenuItems();

		for(let menuItem of menuItems)
		{
			if(
				menuItem.hasOwnProperty('filepath')
				&& menuItem.filepath === searchPath
			)
				return true;
		}

		return false;
	}

	_getParentWithValue(targetItem, searchValue)
	{
		if(targetItem && typeof targetItem === 'object')
		{
			if(targetItem[searchValue])
			{
				/* targetItem is the target we are searching for */
				return targetItem;
			}

			/* Limit loop by max children depth of PopupImageMenuItem */
			let iterLimit = 2;

			while(
				iterLimit--
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

		return null;
	}

	_connectDragSigals(menuItem)
	{
		/* Drag signals are disconnected on actor destroy via DND disconnectAll() */

		/* Show placeholder item when dragging started */
		menuItem.drag.connect('drag-begin', this._onDragBegin.bind(this));

		/* Handle drop item response */
		menuItem.drag.connect('drag-end', this._onDragEnd.bind(this));
	}

	_onDragBegin(obj)
	{
		this.draggedItem = obj.actor._delegate;
		this.isDragging = true;

		let menuItems = this.subMenu.menu._getMenuItems();
		let heighArr = [];

		menuItems.forEach(menuItem =>
		{
			/* Ignore non-playlist item and continue */
			if(!menuItem.filepath)
				return;

			let height = (menuItem.isActor) ?
				menuItem.actor.height : menuItem.height;

			if(!heighArr.includes(height))
				heighArr.push(height);
		});

		let tempIndex = menuItems.indexOf(this.tempMenuItem);
		let dragIndex = menuItems.indexOf(this.draggedItem);

		/* Check if invisible insert item is above or below selected item */
		this.draggedItem.restoreIndex = (tempIndex > dragIndex) ?
			dragIndex : dragIndex - 1;

		this.subMenu.menu.moveMenuItem(this.tempMenuItem, dragIndex);

		if(this.tempMenuItem.isActor)
			this.tempMenuItem.actor.show();
		else
			this.tempMenuItem.show();

		let maxHeight = Math.max.apply(null, heighArr);

		/* Temp item cannot be shorter than any playlist item */
		if(this.tempMenuItem.isActor)
		{
			if(this.tempMenuItem.actor.height != maxHeight)
				this.tempMenuItem.actor.height = maxHeight;
		}
		else
		{
			if(this.tempMenuItem.height != maxHeight)
				this.tempMenuItem.height = maxHeight;
		}
	}

	_onDragEnd(obj, time, res)
	{
		if(!this.isDragging || !this.draggedItem)
			return;

		this.isDragging = false;

		if(this.draggedItem.dropOnTemp || this.draggedItem.isPlaying)
		{
			let menuItems = this.subMenu.menu._getMenuItems();

			let newPlaylistItem = new CastPlaylistItem(
				this.draggedItem.title, this.draggedItem.filepath
			);
			this._connectDragSigals(newPlaylistItem);

			if(this.draggedItem.isPlaying)
				newPlaylistItem.setPlaying(true);

			let tempIndex = menuItems.indexOf(this.tempMenuItem);

			let position = (res)
				? tempIndex
				: (tempIndex > this.draggedItem.restoreIndex)
				? this.draggedItem.restoreIndex
				: this.draggedItem.restoreIndex + 1;

			this.subMenu.menu.addMenuItem(newPlaylistItem, position);
		}

		if(this.tempMenuItem.isActor)
			this.tempMenuItem.actor.hide();
		else
			this.tempMenuItem.hide();

		this.draggedItem.destroy();
		this.draggedItem = null;

		this.updatePlaylistFile();
	}

	_onDragMotion(dragEvent)
	{
		/* Updating label before and after move fixes moveMenuItem() */
		this.tempMenuItem.label.hide();

		let targetItem = (dragEvent.targetActor.hasOwnProperty('_delegate')) ?
			dragEvent.targetActor._delegate : dragEvent.targetActor;

		let menuItems = this.subMenu.menu._getMenuItems();
		let hoverItem = this._getParentWithValue(targetItem, 'isPlaylistItem');

		if(hoverItem)
		{
			let hoverItemIndex = menuItems.indexOf(hoverItem);
			let tempItemIndex = menuItems.indexOf(this.tempMenuItem);

			if(hoverItemIndex !== tempItemIndex)
				this.subMenu.menu.moveMenuItem(this.tempMenuItem, hoverItemIndex);

			if(this.tempMenuItem.isActor)
				this.tempMenuItem.actor.show();
			else
				this.tempMenuItem.show();
		}
		else if(menuItems.length > 1 && !this._getParentWithValue(targetItem, 'isTempPlaylistItem'))
		{
			if(this.tempMenuItem.isActor)
				this.tempMenuItem.actor.hide();
			else
				this.tempMenuItem.hide();
		}

		/* Must be here for moveMenuItem() fix */
		this.tempMenuItem.label.show();

		return DND.DragMotionResult.CONTINUE;
	}

	_onDragDrop(dropEvent)
	{
		/* Allow DND to call "acceptDrop" and handle event */
		if(!this.draggedItem || this._getParentWithValue(dropEvent.targetActor, 'isTempPlaylistItem'))
			return DND.DragDropResult.CONTINUE;

		if(!this.draggedItem.isPlaying || !this.remoteActive)
		{
			/* Destroy dragged causes DND to run its "_cancelDrag" function */
			this.draggedItem.destroy();
			this.draggedItem = null;
		}
		else
		{
			/* Cancel drag to animate flight back to playlist */
			this.draggedItem.drag._cancelDrag(dropEvent.clutterEvent.get_time());
		}

		return DND.DragDropResult.FAILURE;
	}

	destroy()
	{
		/* Nullify draggedItem so app won't try to destroy it elsewhere */
		if(this.draggedItem)
		{
			this.draggedItem.destroy();
			this.draggedItem = null;
		}

		DND.removeDragMonitor(this._dragMonitor);

		/* tempMenuItem is a subMenu item so it will be destroyed with it */
		this.subMenu.destroy();
	}
}

class DragOverride extends DND._Draggable
{
	constructor(actor, params)
	{
		super(actor, params);
	}

	_getRestoreLocation()
	{
		let x = this._snapBackX;
		let y = this._snapBackY;
		let scale = this._snapBackScale;

		return [x, y, scale];
	}
}

let CastPlaylistSubMenu = GObject.registerClass(
class CastPlaylistSubMenu extends PopupMenu.PopupSubMenuMenuItem
{
	_init()
	{
		super._init(_("Playlist"), true);

		this.icon.icon_name = PLAYLIST_MENU_ICON;
		this.isActor = (this.hasOwnProperty('actor'));

		let callback = () =>
		{
			if(this.isActor)
				this.actor.opacity = (this.actor.hover) ? 255 : (this.menu.isOpen) ? 255 : 130;
			else
				this.opacity = (this.hover) ? 255 : (this.menu.isOpen) ? 255 : 130;
		}

		this._openChangedSignal = this.menu.connect('open-state-changed', callback);

		if(this.isActor)
		{
			this.actor.opacity = 130;
			this.hoverSignal = this.actor.connect('notify::hover', callback);
		}
		else
		{
			this.opacity = 130;
			this.hoverSignal = this.connect('notify::hover', callback);
		}
	}

	destroy()
	{
		this.menu.disconnect(this._openChangedSignal);

		if(this.isActor)
			this.actor.disconnect(this.hoverSignal);
		else
			this.disconnect(this.hoverSignal);

		super.destroy();
	}
});

let CastPlaylistItem = GObject.registerClass(
class CastPlaylistItem extends AltPopupImage
{
	_init(title, filepath)
	{
		super._init(title, PLAYLIST_ITEM_INACTIVE_ICON);

		this.isPlaylistItem = true;
		this.isPlaying = false;
		this.title = title;
		this.filepath = filepath;
		this.restoreIndex = 0;
		this.dropOnTemp = false;
		this.isActor = (this.hasOwnProperty('actor'));

		if(this.isActor)
			this.drag = new DragOverride(this.actor);
		else
			this.drag = new DragOverride(this);
	}

	setPlaying(isPlaying)
	{
		if(isPlaying)
			this._icon.icon_name = PLAYLIST_ITEM_ACTIVE_ICON;
		else
			this._icon.icon_name = PLAYLIST_ITEM_INACTIVE_ICON;

		this.isPlaying = isPlaying;
	}

	_onItemClicked()
	{
		/* When clicked active track seeking to zero is faster than reloading file */
		if(this.isPlaying)
		{
			if(seekAllowed)
				Soup.client.postRemote('SEEK', 0);
		}
		else
		{
			if(!Soup.client) return;

			Soup.client.updateSelection(this.filepath);
		}
	}
});

let CastTempPlaylistItem = GObject.registerClass(
class CastTempPlaylistItem extends AltPopupImage
{
	_init(isShown)
	{
		super._init(' ', TEMP_INSERT_ICON);

		this.isTempPlaylistItem = true;
		this.isActor = (this.hasOwnProperty('actor'));

		if(this.isActor)
			this.actor.visible = true;
		else
			this.visible = true;

		if(!isShown)
		{
			(this.isActor) ? this.actor.hide() : this.hide();
		}
	}

	/* This function is called by DND */
	acceptDrop(source, actor, x, y, time)
	{
		if(!source.drag)
			return false;

		source.dropOnTemp = true;
		source.drag.emit('drag-end', time, true);

		return true;
	}

	getVisible()
	{
		if(this.isActor)
			return this.actor.visible;
		else
			return this.visible;
	}
});
