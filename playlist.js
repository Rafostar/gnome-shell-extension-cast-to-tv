const { Clutter } = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;
const Local = imports.misc.extensionUtils.getCurrentExtension();
const Gettext = imports.gettext.domain(Local.metadata['gettext-domain']);
const { AltPopupImage } = Local.imports.compat;
const Temp = Local.imports.temp;
const Helper = Local.imports.helper;
const shared = Local.imports.shared.module.exports;
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
		this.remoteActive = false;

		this._addMenuInsertItem(false, 0);

		this._dragMonitor = {
			dragMotion: this._onDragMotion.bind(this)
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
				if(this.draggedItem && this.draggedItem.filepath === filepath)
				{
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
		if(!this.draggedItem) this.sortMenuItems(playlistArray);
	}

	addMenuPlaylistItem(filepath, isActive, position)
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

		this.subMenu.menu.addMenuItem(playlistItem, position);
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
			else
			{
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
		}

		return null;
	}

	_connectDragSigals(menuItem)
	{
		/* Drag signals are disconnected on actor destroy via DND disconnectAll() */

		/* Show placeholder item when dragging started */
		menuItem.drag.connect('drag-begin', () => this._onDragBegin(menuItem));

		/* Remove item when dragged anywhere besides playlist */
		menuItem.drag.connect('drag-cancelled', this._onDragCancelled.bind(this));

		/* Handle drop item response */
		menuItem.drag.connect('drag-end', this._onDragEnd.bind(this));
	}

	_onDragBegin(menuItem)
	{
		this.draggedItem = menuItem;

		let menuItems = this.subMenu.menu._getMenuItems();

		this.subMenu.menu.moveMenuItem(this.tempMenuItem, menuItems.indexOf(menuItem));

		if(this.tempMenuItem.isActor)
			this.tempMenuItem.actor.show();
		else
			this.tempMenuItem.show();
	}

	_onDragCancelled()
	{
		if(this.draggedItem)
		{
			if(!this.draggedItem.isPlaying || !this.remoteActive)
			{
				this.draggedItem.destroy();
				this.draggedItem = null;

				if(this.tempMenuItem.isActor)
					this.tempMenuItem.actor.hide();
				else
					this.tempMenuItem.hide();

				if(this.remoteActive)
					this.updatePlaylistFile();
			}
		}
	}

	_onDragEnd(obj, time, res)
	{
		/* DND automatically destroys or restores item depending on drag success */
		this.draggedItem = null;

		let menuItems = this.subMenu.menu._getMenuItems();

		if(res && obj.meta && typeof obj.meta === 'object')
		{
			let newPlaylistItem = new CastPlaylistItem(obj.meta.text, obj.meta.filepath);
			this._connectDragSigals(newPlaylistItem);

			if(obj.meta.active) newPlaylistItem.setPlaying(true);

			this.subMenu.menu.addMenuItem(newPlaylistItem, menuItems.indexOf(this.tempMenuItem));
		}
		else
		{
			this.subMenu.menu.moveMenuItem(obj, 0);
		}

		if(this.tempMenuItem.isActor)
			this.tempMenuItem.actor.hide();
		else
			this.tempMenuItem.hide();

		this.updatePlaylistFile();
	}

	_onDragMotion(dragEvent)
	{
		/* Updating label before and after move fixes moveMenuItem() on GNOME 3.32 */
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

		/* Must be here for GNOME 3.32 moveMenuItem() fix */
		this.tempMenuItem.label.show();

		return DND.DragMotionResult.CONTINUE;
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

class CastPlaylistSubMenu extends PopupMenu.PopupSubMenuMenuItem
{
	constructor()
	{
		super(_("Playlist"), true);

		this.icon.icon_name = PLAYLIST_MENU_ICON;

		let callback = () =>
		{
			if(this.hasOwnProperty('actor'))
				this.actor.opacity = (this.actor.hover) ? 255 : (this.menu.isOpen) ? 255 : 130;
			else
				this.opacity = (this.hover) ? 255 : (this.menu.isOpen) ? 255 : 130;
		}

		this._openChangedSignal = this.menu.connect('open-state-changed', callback);

		if(this.hasOwnProperty('actor'))
		{
			this.actor.opacity = 130;
			this.hoverSignal = this.actor.connect('notify::hover', callback);
		}
		else
		{
			this.opacity = 130;
			this.hoverSignal = this.connect('notify::hover', callback);
		}

		this.destroy = () =>
		{
			this.menu.disconnect(this._openChangedSignal);

			if(this.hasOwnProperty('actor'))
				this.actor.disconnect(this.hoverSignal);
			else
				this.disconnect(this.hoverSignal);

			super.destroy();
		}
	}
}

class CastPlaylistItem extends AltPopupImage
{
	constructor(title, filepath)
	{
		super(title, PLAYLIST_ITEM_INACTIVE_ICON);

		this.isPlaylistItem = true;
		this.isPlaying = false;
		this.filepath = filepath;

		if(this.hasOwnProperty('actor'))
			this.drag = DND.makeDraggable(this.actor);
		else
			this.drag = DND.makeDraggable(this);

		this.setPlaying = (isPlaying) =>
		{
			let activate = (isPlaying === true) ? true : false;

			if(activate) this._icon.icon_name = PLAYLIST_ITEM_ACTIVE_ICON;
			else this._icon.icon_name = PLAYLIST_ITEM_INACTIVE_ICON;

			this.isPlaying = activate;
		}

		this._onItemClicked = () =>
		{
			/* When clicked active track seeking to zero is faster than reloading file */
			if(this.isPlaying)
			{
				if(seekAllowed)
					Temp.setRemoteAction('SEEK', 0);
			}
			else
			{
				Helper.readFromFileAsync(shared.selectionPath, (selectionContents) =>
				{
					if(!selectionContents) return;

					selectionContents.filePath = this.filepath;
					Helper.writeToFile(shared.selectionPath, selectionContents);
				});
			}
		}
	}
}

class CastTempPlaylistItem extends AltPopupImage
{
	constructor(isShown)
	{
		super(' ', TEMP_INSERT_ICON);

		this.isTempPlaylistItem = true;
		this.isActor = (this.hasOwnProperty('actor'));

		if(this.isActor) this.actor.visible = true;
		else this.visible = true;

		if(!isShown)
		{
			if(this.isActor) this.actor.hide();
			else this.hide();
		}

		/* This function is called by DND */
		this.acceptDrop = (source, actor, x, y, time) =>
		{
			source.drag.meta = {
				text: source.label.text,
				filepath: source.filepath,
				active: source.isPlaying
			};

			source.drag.emit('drag-end', time, true);

			if(actor) actor.destroy();
			else source.destroy();
		}

		this.getVisible = () =>
		{
			if(this.isActor)
				return this.actor.visible;
			else
				return this.visible;
		}
	}
}
