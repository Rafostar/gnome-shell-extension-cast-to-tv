# Cast to TV Nautilus Extension
# Developers: Rafostar, rendyanthony

import os, json, gettext, locale, gi
gi.require_version('Nautilus', '3.0')
gi.require_version('GObject', '2.0')
from gi.repository import Nautilus, GObject

# A way to get unquote working with python 2 and 3
try:
    from urllib import unquote
except ImportError:
    from urllib.parse import unquote

_ = gettext.gettext

EXTENSION_PATH = os.path.expanduser('~/.local/share/gnome-shell/extensions/cast-to-tv@rafostar.github.com')
TEMP_PATH = '/tmp/.cast-to-tv'
SUBS_FORMATS = ['srt', 'ass', 'vtt']

class CastToTVMenu(GObject.Object, Nautilus.MenuProvider):
    def __init__(self):
        GObject.Object.__init__(self)
        self.subs_path = ""
        self.config = {}
        self.current_name = {"name": "", "fn": ""}

        try:
            locale.setlocale(locale.LC_ALL, '')
            gettext.bindtextdomain('cast-to-tv', EXTENSION_PATH + '/locale')
            gettext.textdomain('cast-to-tv')
        except:
            pass

    def create_menu_item(self, stream_type, files):
        cast_label="Cast Selected File"

        if len(files) > 1:
            cast_label += "s"

        menu_label = self.get_menu_name()

        if not menu_label:
            return None

        top_menuitem = Nautilus.MenuItem(name='CastToTVMenu::CastMenu', label=menu_label)

        submenu = Nautilus.Menu()
        top_menuitem.set_submenu(submenu)

        sub_menuitem_1 = Nautilus.MenuItem(name = 'CastToTVMenu::CastFile', label=_(cast_label))
        sub_menuitem_1.connect('activate', self.cast_files_cb, files, stream_type)
        submenu.append_item(sub_menuitem_1)

        if stream_type == 'VIDEO':
            sub_menuitem_2 = Nautilus.MenuItem(name='CastToTVMenu::TranscodeVideo', label=_("Transcode Video"))
            sub_menuitem_2.connect('activate', self.transcode_files_cb, files, stream_type)
            submenu.append_item(sub_menuitem_2)

        return top_menuitem

    def get_menu_name(self):
        if ((self.config['receiverType'] == 'chromecast' and
            not self.config['chromecastName']) or
            (self.config['receiverType'] == 'chromecast' and
            not os.path.isfile(EXTENSION_PATH + '/config/devices.json'))):
                return "Chromecast"
        elif self.config['receiverType'] == 'other':
            return _("Web browser | Media player")

        # Reduce disk reads when selecting files
        if self.config['chromecastName'] == self.current_name['name']:
            return self.current_name['fn']

        with open(EXTENSION_PATH + '/config/devices.json') as devices:
            for device in json.load(devices):
                if device['name'] == self.config['chromecastName']:
                    self.current_name['name'] = device['name']
                    self.current_name['fn'] = device['friendlyName']
                    return self.current_name['fn']

        return None

    def get_file_uri(self, file):
        file_uri = file.get_activation_uri()
        if file_uri.startswith('file://'):
            return file_uri[7:]

        return None

    def check_subtitles(self, files):
        if (self.is_subtitles_file(files[0]) and files[1].is_mime_type('video/*')):
            self.subs_path = unquote(self.get_file_uri(files[0]))
        elif (files[0].is_mime_type('video/*') and self.is_subtitles_file(files[1])):
            self.subs_path = unquote(self.get_file_uri(files[1]))
        else:
            return False

        return True

    def is_subtitles_file(self, file):
        if file.is_mime_type('text/*'):
            filename = self.get_file_uri(file)
            if filename:
                basename = os.path.basename(filename)
                ext = os.path.splitext(filename)[1][1:].lower()
                if ext in SUBS_FORMATS:
                    return True

        return False

    def detect_stream_type(self, files):
        stream_type = None

        for file in files:
            if not self.get_file_uri(file):
                return None

            if file.is_mime_type('video/*'):
                if not self.compare_streams(stream_type, 'VIDEO'):
                    return None
                stream_type = 'VIDEO'
            elif file.is_mime_type('audio/*'):
                if not self.compare_streams(stream_type, 'MUSIC'):
                    return None
                stream_type = 'MUSIC'
            elif file.is_mime_type('image/*'):
                if not self.compare_streams(stream_type, 'PICTURE'):
                    return None
                stream_type = 'PICTURE'
            else:
                return None

        return stream_type

    def compare_streams(self, stream1, stream2):
        if stream1 and stream1 != stream2:
            return False

        return True

    def cast_files_cb(self, menu, files, stream_type):
        playlist = [
            unquote(self.get_file_uri(file))
            for file in files
            if not self.is_subtitles_file(file)
        ]

        # Playlist must be updated before selection file
        with open(TEMP_PATH + '/playlist.json', "w") as fp:
            json.dump(playlist, fp, indent=1)

        selection = {
            "streamType": stream_type,
            "subsPath": self.subs_path,
            "filePath": playlist[0]
        }

        with open(TEMP_PATH + '/selection.json', "w") as fp:
            json.dump(selection, fp, indent=1)

    def transcode_files_cb(self, menu, files, stream_type):
        if self.config['videoAcceleration'] == 'vaapi':
            stream_type += '_VAAPI'
        elif self.config['videoAcceleration'] == 'nvenc':
            stream_type += '_NVENC'
        else:
            stream_type += '_ENCODE'

        self.cast_files_cb(menu, files, stream_type)

    def get_file_items(self, window, files):
        if not (os.path.isfile(TEMP_PATH + '/config.json') and
            os.path.isfile(TEMP_PATH + '/playlist.json') and
            os.path.isfile(TEMP_PATH + '/selection.json')):
                return

        stream_type = None
        is_video_and_subs = False

        with open(TEMP_PATH + '/config.json') as config:
            self.config = json.load(config)

        if len(files) == 2:
            is_video_and_subs = self.check_subtitles(files)

        if is_video_and_subs:
            stream_type = 'VIDEO'
        else:
            self.subs_path = ""
            stream_type = self.detect_stream_type(files)

        if not stream_type:
            return

        cast_menu = self.create_menu_item(stream_type, files)

        if not cast_menu:
            return

        return cast_menu,
