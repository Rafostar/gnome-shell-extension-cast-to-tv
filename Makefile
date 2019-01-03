# Basic Makefile

UUID = cast-to-tv@rafostar.github.com
TOLOCALIZE =  extension.js filechooser.js prefs.js
MSGSRC = $(wildcard ./po/*.po)
POTFILE = ./po/cast-to-tv.pot

schemas:
	glib-compile-schemas ./schemas/

potfile:
	mkdir -p po
	xgettext -o $(POTFILE) --package-name "Cast to TV" $(TOLOCALIZE)

mergepo:
	for i in $(MSGSRC); do \
		msgmerge -U $$i $(POTFILE); \
	done;

compilemo:
	mkdir -p locale
	for i in $(MSGSRC); do \
		mkdir -p ./locale/`basename $$i .po`; \
		mkdir -p ./locale/`basename $$i .po`/LC_MESSAGES; \
		msgfmt -c -o ./locale/`basename $$i .po`/LC_MESSAGES/cast-to-tv.mo $$i; \
	done;
