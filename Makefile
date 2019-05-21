# Basic Makefile

UUID = cast-to-tv@rafostar.github.com
GETTEXT = cast-to-tv
PACKAGE = "Cast to TV"
TOLOCALIZE = extension.js widget.js file-chooser.js prefs.js node_scripts/messages.js
MSGSRC = $(wildcard ./po/cast-to-tv/*.po)
POTFILE = ./po/cast-to-tv/cast-to-tv.pot
ZIPFILES = *.js *.json node_scripts webplayer schemas locale appIcon nautilus LICENSE README.md
INSTALLPATH = ~/.local/share/gnome-shell/extensions

# Add-ons translations #
POFOLDERS = $(wildcard ./po/cast-to-tv-*-addon)

# Compile schemas #
glib-schemas:
	glib-compile-schemas ./schemas/

# Create/update potfile #
potfile:
	mkdir -p ./po
	xgettext -o $(POTFILE) --language=JavaScript --add-comments=TRANSLATORS: --package-name $(PACKAGE) $(TOLOCALIZE)

# Update '.po' from 'potfile' #
mergepo:
	for i in $(MSGSRC); do \
		msgmerge -U $$i $(POTFILE); \
	done;

# Compile .mo files #
compilemo:
	for i in $(MSGSRC); do \
		mkdir -p ./locale/`basename $$i .po`/LC_MESSAGES; \
		msgfmt -c -o ./locale/`basename $$i .po`/LC_MESSAGES/$(GETTEXT).mo $$i; \
	done;
	for i in $(POFOLDERS); do \
		for j in $$i/*.po; do \
			mkdir -p ./locale_addons/`basename $$i`/`basename $$j .po`/LC_MESSAGES; \
			msgfmt -c -o ./locale_addons/`basename $$i`/`basename $$j .po`/LC_MESSAGES/`basename $$i`.mo $$j; \
		done; \
	done;

# Create release zip #
zip-file: _build
	zip -qr $(UUID).zip $(ZIPFILES)

# Build and install #
install: zip-file
	mkdir -p $(INSTALLPATH)/$(UUID)
	unzip -qo $(UUID).zip -d $(INSTALLPATH)/$(UUID)

_build: glib-schemas potfile mergepo compilemo

