# Cast to TV Nautilus/Nemo Extension
# Developers: Rafostar, rendyanthony

import os
import sys
import json
import gettext
import locale
import gi
from gi.repository import GObject, Gio
gi.require_version('Nautilus', '3.0')
gi.require_version('GObject', '2.0')
gi.require_version('Gio', '2.0')

if 'nemo' in sys.argv[0].lower():
    gi.require_version('Nemo', '3.0')
    from gi.repository import Nemo as FileManager
else:
    gi.require_version('Nautilus', '3.0')
    from gi.repository import Nautilus as FileManager

# A way to get unquote working with python 2 and 3
try:
    from urllib import unquote
except ImportError:
    from urllib.parse import unquote

_ = gettext.gettext

EXTENSION_NAME = 'cast-to-tv@rafostar.github.com'
EXTENSION_PATH = os.path.expanduser(
    '~/.local/share/gnome-shell/extensions/' + EXTENSION_NAME
                                    )
TEMP_PATH = '/tmp/.cast-to-tv'
SUBS_FORMATS = ['srt', 'ass', 'vtt']


class CastToTVMenu(GObject.Object, FileManager.MenuProvider):
    def __init__(self):
        GObject.Object.__init__(self)
        self.subs_path = ""
        self.config = {}
        self.current_name = {"name": "", "fn": ""}
        self.settings = Gio.Settings('org.gnome.shell')

        Gio_SSS = Gio.SettingsSchemaSource
        schema_source = Gio_SSS.new_from_directory(
            EXTENSION_PATH + '/schemas', Gio_SSS.get_default(), False
        )
        schema_obj = schema_source.lookup(
            'org.gnome.shell.extensions.cast-to-tv', True
        )
        self.ext_settings = Gio.Settings.new_full(schema_obj)

        try:
            locale.setlocale(locale.LC_ALL, '')
            gettext.bindtextdomain('cast-to-tv', EXTENSION_PATH + '/locale')
            gettext.textdomain('cast-to-tv')
        except:
            pass

    def check_extension_enabled(self):
        all_extensions_disabled = self.settings.get_boolean(
            'disable-user-extensions'
        )

        if not all_extensions_disabled:
            enabled_extensions = self.settings.get_strv('enabled-extensions')
            if EXTENSION_NAME in enabled_extensions:
                return True

        return False

    def create_menu_item(self, stream_type, files):
        cast_label = "Cast Selected File"

        if len(files) > 1:
            cast_label += "s"

        menu_label = self.get_menu_name()

        if not menu_label:
            return None

        top_menuitem = FileManager.MenuItem(
            name='CastToTVMenu::CastMenu',
            label=menu_label
        )

        submenu = FileManager.Menu()
        top_menuitem.set_submenu(submenu)

        sub_menuitem_1 = FileManager.MenuItem(
            name='CastToTVMenu::CastFile', label=_(cast_label)
        )
        sub_menuitem_1.connect(
            'activate', self.cast_files_cb, files, stream_type, False
        )
        submenu.append_item(sub_menuitem_1)

        if stream_type == 'VIDEO':
            sub_menuitem_2 = FileManager.MenuItem(
                name='CastTranscodeMenu::Transcode', label=_("Transcode")
            )
            submenu_2 = FileManager.Menu()
            sub_menuitem_2.set_submenu(submenu_2)

            sub_sub_menuitem_1 = FileManager.MenuItem(
                name='CastTranscodeMenu::Video', label=_("Video")
            )
            sub_sub_menuitem_1.connect(
                'activate', self.transcode_files_cb, files, stream_type, False
            )
            submenu_2.append_item(sub_sub_menuitem_1)

            sub_sub_menuitem_3 = FileManager.MenuItem(
                name='CastTranscodeMenu::Video+Audio', label=_("Video + Audio")
            )
            sub_sub_menuitem_3.connect(
                'activate', self.transcode_files_cb, files, stream_type, True
            )
            submenu_2.append_item(sub_sub_menuitem_3)

            submenu.append_item(sub_menuitem_2)

        return top_menuitem

    def get_menu_name(self):
        if (
                (
                    self.config['receiverType'] == 'chromecast' and not
                    self.config['chromecastName']
                ) or (
                    self.config['receiverType'] == 'chromecast' and not
                    os.path.isfile(EXTENSION_PATH + '/config/devices.json')
                )
        ):
            return "Chromecast"
        elif self.config['receiverType'] == 'playercast':
            if self.config['playercastName']:
                return self.config['playercastName']
            else:
                return "Playercast"
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
        if (
                self.is_subtitles_file(files[0]) and
                files[1].is_mime_type('video/*')
        ):
            self.subs_path = unquote(self.get_file_uri(files[0]))
        elif (
                files[0].is_mime_type('video/*') and
                self.is_subtitles_file(files[1])
        ):
            self.subs_path = unquote(self.get_file_uri(files[1]))
        else:
            return False

        return True

    def is_subtitles_file(self, file):
        if file.is_mime_type('text/*'):
            filename = self.get_file_uri(file)
            if filename:
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

    def cast_files_cb(self, menu, files, stream_type, is_transcode_audio):
        playlist = [
            unquote(self.get_file_uri(file))
            for file in files
            if not self.is_subtitles_file(file)
        ]

        # Playlist must be updated before selection file
        with open(TEMP_PATH + '/playlist.json', 'w') as fp:
            json.dump(playlist, fp, indent=1, ensure_ascii=False)

        selection = {
            "streamType": stream_type,
            "subsPath": self.subs_path,
            "filePath": playlist[0],
            "transcodeAudio": is_transcode_audio
        }

        with open(TEMP_PATH + '/selection.json', 'w') as fp:
            json.dump(selection, fp, indent=1, ensure_ascii=False)

    def transcode_files_cb(self, menu, files, stream_type, is_transcode_audio):
        if self.config['videoAcceleration'] == 'vaapi':
            stream_type += '_VAAPI'
        elif self.config['videoAcceleration'] == 'nvenc':
            stream_type += '_NVENC'
        else:
            stream_type += '_ENCODE'

        self.cast_files_cb(menu, files, stream_type, is_transcode_audio)

    def get_file_items(self, window, files):
        if not self.ext_settings.get_boolean('service-enabled'):
            return

        if not (
                os.path.isfile(TEMP_PATH + '/config.json') and
                os.path.isfile(TEMP_PATH + '/playlist.json') and
                os.path.isfile(TEMP_PATH + '/selection.json')
        ):
            return

        extension_enabled = self.check_extension_enabled()
        if not extension_enabled:
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
