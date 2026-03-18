import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Claude2xPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // Panel group
        const panelGroup = new Adw.PreferencesGroup({
            title: 'Panel',
            description: 'Configure the panel indicator',
        });
        page.add(panelGroup);

        // Position combo row
        const posRow = new Adw.ComboRow({
            title: 'Position in panel',
            subtitle: 'Where to show the 2\u00d7 indicator',
        });

        const model = new Gtk.StringList();
        model.append('Left');
        model.append('Center');
        model.append('Right');
        posRow.set_model(model);

        const positions = ['left', 'center', 'right'];
        const current = settings.get_string('panel-position');
        posRow.set_selected(Math.max(0, positions.indexOf(current)));

        posRow.connect('notify::selected', () => {
            settings.set_string('panel-position', positions[posRow.get_selected()]);
        });

        panelGroup.add(posRow);
    }
}
