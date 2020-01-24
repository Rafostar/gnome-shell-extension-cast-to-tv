# Cast to TV Nautilus/Nemo Extension
# Developer: Rafostar

import os, sys, json, gettext, locale, gi
gi.require_version('GObject', '2.0')
gi.require_version('Gio', '2.0')
gi.require_version('Soup', '2.4')
from gi.repository import GObject, Gio, Soup

if 'nemo' in sys.argv[0].lower():
    gi.require_version('Nemo', '3.0')
    from gi.repository import Nemo as FileManager
else:
    gi.require_version('Nautilus', '3.0')
    from gi.repository import Nautilus as FileManager

_ = gettext.gettext
EXTENSION_NAME = 'cast-to-tv@rafostar.github.com'
EXTENSION_PATH = os.path.expanduser('~/.local/share/gnome-shell/extensions/' + EXTENSION_NAME)
TEMP_PATH = '/tmp/.cast-to-tv'
SUBS_FORMATS = ['srt', 'ass', 'vtt']

class CastToTVMenu(GObject.Object, FileManager.MenuProvider):
    def __init__(self):
        GObject.Object.__init__(self)
        self.subs_path = ""
        self.current_name = {"name": "", "fn": ""}
        self.settings = Gio.Settings('org.gnome.shell')
        self.ext_settings = None
        self.soup_client = Soup.Session(timeout=3)

        Gio_SSS = Gio.SettingsSchemaSource
        if os.path.isfile(EXTENSION_PATH + '/schemas/gschemas.compiled'):
            schema_source = Gio_SSS.new_from_directory(
                EXTENSION_PATH + '/schemas', Gio_SSS.get_default(), False)
        else:
            schema_source = Gio_SSS.get_default()

        schema_obj = schema_source.lookup('org.gnome.shell.extensions.cast-to-tv', True)
        if schema_obj:
            self.ext_settings = Gio.Settings.new_full(schema_obj)

        locale.setlocale(locale.LC_ALL, '')
        if os.path.exists(EXTENSION_PATH + '/locale'):
            gettext.bindtextdomain('cast-to-tv', EXTENSION_PATH + '/locale')
        else:
            gettext.bindtextdomain('cast-to-tv', None)
        gettext.textdomain('cast-to-tv')

    def get_extension_enabled(self):
        all_extensions_disabled = self.settings.get_boolean('disable-user-extensions')

        if not all_extensions_disabled:
            enabled_extensions = self.settings.get_strv('enabled-extensions')
            if EXTENSION_NAME in enabled_extensions:
                return True

        return False

    def get_soup_data(self, data_type):
        port = self.ext_settings.get_int('listening-port')
        url = 'http://127.0.0.1:' + str(port) + '/temp/' + data_type
        msg = Soup.Message.new('GET', url)
        response = self.soup_client.send_message(msg)
        if response == 200:
            return json.loads(msg.response_body.data)

        return None

    def post_soup_data(self, data_type, data, is_append):
        port = self.ext_settings.get_int('listening-port')
        url = 'http://127.0.0.1:' + str(port) + '/temp/' + data_type

        if (data_type == 'playlist' and is_append):
            url += '?append=true'

        msg = Soup.Message.new('POST', url)
        params = json.dumps(data)
        msg.set_request(
            'application/json',
            Soup.MemoryUse.COPY,
            bytearray(params, 'utf-8')
        )
        response = self.soup_client.send_message(msg)
        if response == 200:
            return True

        return False

    def create_menu_item(self, stream_type, files):
        cast_label="Cast Selected File"
        if len(files) > 1:
            cast_label += "s"

        cast_devices = []
        parsed_devices = []
        receiver_type = self.ext_settings.get_string('receiver-type')

        if not self.ext_settings.get_boolean('chromecast-playing'):
            if receiver_type == 'chromecast':
                cast_devices = json.loads(self.ext_settings.get_string('chromecast-devices'))
                for device in cast_devices:
                    if (device['name'].endswith('.local') or device['ip']):
                        parsed_devices.append(device)
            elif receiver_type == 'playercast':
                parsed_devices = self.get_soup_data('playercasts')

        if len(parsed_devices) > 1:
            menu_label = self.get_menu_name(False)
        else:
            menu_label = self.get_menu_name(True)

        if not menu_label:
            return None

        top_menuitem = FileManager.MenuItem(name='CastToTVMenu::CastMenu', label=menu_label)
        submenu = FileManager.Menu()
        top_menuitem.set_submenu(submenu)

        if len(parsed_devices) > 1:
            for device in parsed_devices:
                if receiver_type == 'playercast':
                    device = {"friendlyName": device, "name": device}
                self.add_menu_device(stream_type, files, cast_label, submenu, device, False)
        else:
            self.add_menu_device(stream_type, files, cast_label, submenu, None, True)

        return top_menuitem

    def add_menu_device(self, stream_type, files, cast_label, submenu, device, is_short_list):
        if (is_short_list or not device):
            device_config_name = None
            cast_submenu = submenu
            playlist_allowed = self.get_playlist_allowed(stream_type)
        else:
            device_config_name = device['name']
            cast_submenu = FileManager.Menu()
            name_item = FileManager.MenuItem(name='CastToTVMenu::CastFile', label=device['friendlyName'])
            name_item.set_submenu(cast_submenu)
            submenu.append_item(name_item)
            playlist_allowed = False
            receiver_type = self.ext_settings.get_string('receiver-type')
            if receiver_type == 'chromecast':
                if device_config_name == self.ext_settings.get_string('chromecast-name'):
                    playlist_allowed = self.get_playlist_allowed(stream_type)
            elif receiver_type == 'playercast':
                if device_config_name == self.ext_settings.get_string('playercast-name'):
                    playlist_allowed = self.get_playlist_allowed(stream_type)

        cast_item = FileManager.MenuItem(name='CastToTVMenu::CastFile', label=_(cast_label))
        cast_item.connect('activate', self.cast_files_cb, files, stream_type, False, device_config_name)
        cast_submenu.append_item(cast_item)

        if playlist_allowed:
            playlist_item = FileManager.MenuItem(name='CastToTVMenu::AddToPlaylist', label=_("Add to Playlist"))
            playlist_item.connect('activate', self.add_to_playlist_cb, files, stream_type, False)
            cast_submenu.append_item(playlist_item)

        if stream_type == 'VIDEO':
            transcode_item = FileManager.MenuItem(name='CastTranscodeMenu::Transcode', label=_("Transcode"))
            transcode_submenu = FileManager.Menu()
            transcode_item.set_submenu(transcode_submenu)

            video_only_item = FileManager.MenuItem(name='CastTranscodeMenu::Video', label=_("Video"))
            video_only_item.connect('activate', self.transcode_files_cb, files, stream_type, False, device_config_name)
            transcode_submenu.append_item(video_only_item)

            #audio_only_item = FileManager.MenuItem(name='CastTranscodeMenu::Audio', label=_("Audio"))
            #audio_only_item.connect('activate', self.cast_files_cb, files, stream_type, True, device_config_name)
            #transcode_submenu.append_item(audio_only_item)

            video_audio_item = FileManager.MenuItem(name='CastTranscodeMenu::Video+Audio', label=_("Video + Audio"))
            video_audio_item.connect('activate', self.transcode_files_cb, files, stream_type, True, device_config_name)
            transcode_submenu.append_item(video_audio_item)

            cast_submenu.append_item(transcode_item)

    def get_menu_name(self, use_friendly_name):
        receiver_type = self.ext_settings.get_string('receiver-type')
        chromecast_name = None

        if receiver_type == 'chromecast':
            if not use_friendly_name:
                return "Chromecast"
            else:
                chromecast_name = self.ext_settings.get_string('chromecast-name')
                if not chromecast_name:
                    return "Chromecast"
        elif receiver_type == 'playercast':
            if not use_friendly_name:
                return "Playercast"
            else:
                playercast_name = self.ext_settings.get_string('playercast-name')
                if playercast_name:
                    return playercast_name
                else:
                    return "Playercast"
        elif receiver_type == 'other':
            return _("Web browser | Media player")
        else:
            return None

        # Reduce extension settings reads (and below loop runs) when selecting files
        if chromecast_name == self.current_name['name']:
            return self.current_name['fn']

        for device in json.loads(self.ext_settings.get_string('chromecast-devices')):
            if device['name'] == chromecast_name:
                self.current_name['name'] = device['name']
                self.current_name['fn'] = device['friendlyName']
                return self.current_name['fn']

        return None

    def get_file_path(self, file):
        file_location = file.get_location()
        if file_location:
            file_path = file_location.get_path()
            if file_path:
                return file_path

        return None

    def get_is_video_and_subs(self, files):
        if (self.get_is_subtitles_file(files[0]) and files[1].is_mime_type('video/*')):
            self.subs_path = self.get_file_path(files[0])
        elif (files[0].is_mime_type('video/*') and self.get_is_subtitles_file(files[1])):
            self.subs_path = self.get_file_path(files[1])
        else:
            return False

        return True

    def get_is_subtitles_file(self, file):
        if file.is_mime_type('text/*'):
            filename = self.get_file_path(file)
            if filename:
                ext = os.path.splitext(filename)[1][1:].lower()
                if ext in SUBS_FORMATS:
                    return True

        return False

    def detect_stream_type(self, files):
        stream_type = None

        for file in files:
            if not self.get_file_path(file):
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

    def get_parsed_playlist(self, files):
        parsed_files = [
            self.get_file_path(parsed_file)
            for parsed_file in files
            if not self.get_is_subtitles_file(parsed_file)
        ]

        return parsed_files

    def cast_files_cb(self, menu, files, stream_type, is_transcode_audio, device_config_name):
        if device_config_name != None:
            receiver_type = self.ext_settings.get_string('receiver-type')
            if receiver_type == 'chromecast':
                self.post_soup_data('config', { "chromecastName": device_config_name })
                self.ext_settings.set_string('chromecast-name', device_config_name)
            elif receiver_type == 'playercast':
                self.post_soup_data('config', { "playercastName": device_config_name })
                self.ext_settings.set_string('playercast-name', device_config_name)

        # Playlist must be updated before selection file
        playlist = self.get_parsed_playlist(files)
        self.post_soup_data('playlist', playlist, False)

        selection = {
            "streamType": stream_type,
            "subsPath": self.subs_path,
            "filePath": playlist[0],
            "transcodeAudio": is_transcode_audio
        }

        self.post_soup_data('selection', selection, False)

    def add_to_playlist_cb(self, menu, files, stream_type, is_transcode_audio):
        # Check if Chromecast did not stop playing before option select
        playlist_allowed = self.get_playlist_allowed(stream_type)
        if playlist_allowed:
            playlist = self.get_parsed_playlist(files)
            self.post_soup_data('playlist', playlist, True)
        else:
            self.cast_files_cb(menu, files, stream_type, is_transcode_audio, None)

    def transcode_files_cb(self, menu, files, stream_type, is_transcode_audio, device_config_name):
        video_acceleration = self.ext_settings.get_string('video-acceleration')
        if video_acceleration == 'vaapi':
            stream_type += '_VAAPI'
        elif video_acceleration == 'nvenc':
            stream_type += '_NVENC'
        else:
            stream_type += '_ENCODE'

        self.cast_files_cb(menu, files, stream_type, is_transcode_audio, device_config_name)

    def get_playlist_allowed(self, stream_type):
        chromecast_playing = self.ext_settings.get_boolean('chromecast-playing')
        if chromecast_playing:
            preselection = self.get_soup_data('selection')

            if (
                preselection
                and not 'addon' in preselection
                and preselection['streamType'] == stream_type
                and 'transcodeAudio' in preselection
                and not preselection['transcodeAudio']
            ):
                return True

        return False

    def get_file_items(self, window, files):
        if (not self.settings or not self.ext_settings):
            return

        if not self.ext_settings.get_boolean('service-enabled'):
            return

        extension_enabled = self.get_extension_enabled()
        if not extension_enabled:
            return

        stream_type = None
        is_video_and_subs = False

        if len(files) == 2:
            is_video_and_subs = self.get_is_video_and_subs(files)

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
