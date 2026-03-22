import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Promo boundaries (ET)
const PROMO_START = {y: 2026, m: 3, d: 13};
const PROMO_END   = {y: 2026, m: 3, d: 28}; // midnight after Mar 27

// Peak hours: weekdays 8:00 AM - 2:00 PM ET
const PEAK_START = 480;  // 8 * 60 minutes
const PEAK_END   = 840;  // 14 * 60 minutes

const Claude2xIndicator = GObject.registerClass(
class Claude2xIndicator extends PanelMenu.Button {
    _init(extensionObject) {
        super._init(0.5, 'Claude 2x Hours');

        this._extensionObject = extensionObject;
        this._etTz = GLib.TimeZone.new('America/New_York');
        this._localTz = GLib.TimeZone.new_local();
        this._promoStart = GLib.DateTime.new(this._etTz, PROMO_START.y, PROMO_START.m, PROMO_START.d, 0, 0, 0);
        this._promoEnd = GLib.DateTime.new(this._etTz, PROMO_END.y, PROMO_END.m, PROMO_END.d, 0, 0, 0);
        this._timerId = null;
        this._pulseActive = false;
        this._pulseIdleId = null;
        this._cleanedUp = false;

        this._buildPanel();
        this._buildMenu();
        this._update();
        this._startTimer();
    }

    // ── Panel badge ──────────────────────────────────────────────

    _buildPanel() {
        this._panelBox = new St.BoxLayout({
            style_class: 'c2x-panel-box',
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Status icon — large, pulsable character (replaces tiny dot)
        this._iconLabel = new St.Label({
            style_class: 'c2x-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Main status text — "2× · 5:23" or "2× in 1:23"
        this._textLabel = new St.Label({
            style_class: 'c2x-text',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._panelBox.add_child(this._iconLabel);
        this._panelBox.add_child(this._textLabel);
        this.add_child(this._panelBox);
    }

    // ── Popup menu ───────────────────────────────────────────────

    _buildMenu() {
        // Header
        this._headerItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._headerBox = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'c2x-header-box'});
        this._headerLabel = new St.Label({style_class: 'c2x-header', x_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this._subheaderLabel = new St.Label({style_class: 'c2x-subheader', x_align: Clutter.ActorAlign.CENTER, x_expand: true});
        this._headerBox.add_child(this._headerLabel);
        this._headerBox.add_child(this._subheaderLabel);
        this._headerItem.add_child(this._headerBox);
        this.menu.addMenuItem(this._headerItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Countdown + progress
        this._countdownItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._countdownBox = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'c2x-section'});

        this._countdownRow = new St.BoxLayout({x_expand: true});
        this._countdownKeyLabel = new St.Label({style_class: 'c2x-label', x_expand: true});
        this._countdownValLabel = new St.Label({style_class: 'c2x-value'});
        this._countdownRow.add_child(this._countdownKeyLabel);
        this._countdownRow.add_child(this._countdownValLabel);
        this._countdownBox.add_child(this._countdownRow);

        this._progressTrack = new St.BoxLayout({style_class: 'c2x-progress-track', x_expand: true});
        this._progressFill = new St.Widget({style_class: 'c2x-progress-fill'});
        this._progressTrack.add_child(this._progressFill);
        this._countdownBox.add_child(this._progressTrack);

        this._percentLabel = new St.Label({style_class: 'c2x-percent', x_align: Clutter.ActorAlign.END, x_expand: true});
        this._countdownBox.add_child(this._percentLabel);

        this._countdownItem.add_child(this._countdownBox);
        this.menu.addMenuItem(this._countdownItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Info rows
        this._infoItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._infoBox = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'c2x-section'});

        this._nextRow = this._makeInfoRow('Next change');
        this._nextValue = this._nextRow._val;
        this._infoBox.add_child(this._nextRow);

        this._localRow = this._makeInfoRow('Your time');
        this._localValue = this._localRow._val;
        this._infoBox.add_child(this._localRow);

        this._promoRow = this._makeInfoRow('Promo ends');
        this._promoValue = this._promoRow._val;
        this._infoBox.add_child(this._promoRow);

        this._infoItem.add_child(this._infoBox);
        this.menu.addMenuItem(this._infoItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Schedule
        this._schedItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._schedBox = new St.BoxLayout({vertical: true, x_expand: true, style_class: 'c2x-section'});

        this._schedBox.add_child(new St.Label({style_class: 'c2x-schedule-title', text: 'SCHEDULE (ET)'}));

        const sched = [
            ['Mon\u2013Fri', '2 PM \u2013 8 AM', '2\u00d7', true],
            ['Mon\u2013Fri', '8 AM \u2013 2 PM', '1\u00d7', false],
            ['Weekends',     'All day',           '2\u00d7', true],
        ];
        for (const [day, time, mult, gold] of sched) {
            const row = new St.BoxLayout({x_expand: true, style_class: 'c2x-schedule-row'});
            row.add_child(new St.Label({style_class: 'c2x-sched-day', text: day, x_expand: true}));
            row.add_child(new St.Label({style_class: 'c2x-sched-time', text: time}));
            row.add_child(new St.Label({
                style_class: gold ? 'c2x-sched-mult-gold' : 'c2x-sched-mult-muted',
                text: `  ${mult}`,
            }));
            this._schedBox.add_child(row);
        }

        this._schedItem.add_child(this._schedBox);
        this.menu.addMenuItem(this._schedItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Footer
        this._footerItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        this._footerLabel = new St.Label({
            style_class: 'c2x-footer',
            text: 'Claude 2\u00d7 Hours Tracker',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._footerItem.add_child(this._footerLabel);
        this.menu.addMenuItem(this._footerItem);
    }

    _makeInfoRow(label) {
        const row = new St.BoxLayout({x_expand: true});
        row.add_child(new St.Label({style_class: 'c2x-label', text: label, x_expand: true}));
        const val = new St.Label({style_class: 'c2x-value'});
        row.add_child(val);
        row._val = val;
        return row;
    }

    // ── Time logic ───────────────────────────────────────────────

    _getStatus() {
        const now = GLib.DateTime.new_now(this._etTz);
        const year  = now.get_year();
        const month = now.get_month();
        const day   = now.get_day_of_month();
        const dow   = now.get_day_of_week(); // 1=Mon … 7=Sun
        const minuteOfDay = now.get_hour() * 60 + now.get_minute();

        const promoStart = this._promoStart;
        const promoEnd   = this._promoEnd;

        // Before promo
        if (now.compare(promoStart) < 0) {
            const sec = promoStart.difference(now) / 1000000;
            return {status: 'before', secondsLeft: sec};
        }

        // After promo
        if (now.compare(promoEnd) >= 0)
            return {status: 'after'};

        // During promo — determine current period
        const isWeekend = dow === 6 || dow === 7;
        const isPeak = !isWeekend && minuteOfDay >= PEAK_START && minuteOfDay < PEAK_END;
        const isDouble = !isPeak;

        let periodStart, periodEnd;

        if (isPeak) {
            // Weekday 8 AM – 2 PM
            periodStart = GLib.DateTime.new(this._etTz, year, month, day, 8, 0, 0);
            periodEnd   = GLib.DateTime.new(this._etTz, year, month, day, 14, 0, 0);

        } else if (isWeekend) {
            // Weekend: 2× stretches from Friday 2 PM to Monday 8 AM
            const friBack = dow === 6 ? 1 : 2;
            const fri = now.add_days(-friBack);
            periodStart = GLib.DateTime.new(this._etTz, fri.get_year(), fri.get_month(), fri.get_day_of_month(), 14, 0, 0);

            const monFwd = dow === 6 ? 2 : 1;
            const mon = now.add_days(monFwd);
            periodEnd = GLib.DateTime.new(this._etTz, mon.get_year(), mon.get_month(), mon.get_day_of_month(), 8, 0, 0);

        } else if (minuteOfDay < PEAK_START) {
            // Weekday before 8 AM
            if (dow === 1) {
                // Monday morning: period started Friday 2 PM
                const fri = now.add_days(-3);
                periodStart = GLib.DateTime.new(this._etTz, fri.get_year(), fri.get_month(), fri.get_day_of_month(), 14, 0, 0);
            } else {
                const yest = now.add_days(-1);
                periodStart = GLib.DateTime.new(this._etTz, yest.get_year(), yest.get_month(), yest.get_day_of_month(), 14, 0, 0);
            }
            periodEnd = GLib.DateTime.new(this._etTz, year, month, day, 8, 0, 0);

        } else {
            // Weekday after 2 PM
            periodStart = GLib.DateTime.new(this._etTz, year, month, day, 14, 0, 0);
            if (dow === 5) {
                // Friday evening: runs through weekend to Monday 8 AM
                const mon = now.add_days(3);
                periodEnd = GLib.DateTime.new(this._etTz, mon.get_year(), mon.get_month(), mon.get_day_of_month(), 8, 0, 0);
            } else {
                const tom = now.add_days(1);
                periodEnd = GLib.DateTime.new(this._etTz, tom.get_year(), tom.get_month(), tom.get_day_of_month(), 8, 0, 0);
            }
        }

        // Clamp to promo window
        if (periodStart.compare(promoStart) < 0) periodStart = promoStart;
        if (periodEnd.compare(promoEnd) > 0)     periodEnd   = promoEnd;

        const totalSec     = periodEnd.difference(periodStart) / 1000000;
        const elapsedSec   = now.difference(periodStart)       / 1000000;
        const remainingSec = periodEnd.difference(now)          / 1000000;
        const progress     = totalSec > 0 ? Math.max(0, Math.min(1, elapsedSec / totalSec)) : 0;

        // Format period-end in ET
        const etTimeStr = this._fmtTime(periodEnd);

        // Convert to local time
        const localTimeStr = this._fmtTime(periodEnd.to_timezone(this._localTz));

        // Days until promo ends
        const daysLeft = Math.ceil(promoEnd.difference(now) / 1000000 / 86400);

        return {
            status: isDouble ? 'double' : 'peak',
            isDouble,
            remainingSec: Math.max(0, remainingSec),
            progress,
            daysLeft,
            etTimeStr,
            localTimeStr,
        };
    }

    _fmtTime(dt) {
        const h = dt.get_hour();
        const m = dt.get_minute();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const dh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        return `${dh}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    _fmtCountdown(sec) {
        sec = Math.max(0, Math.floor(sec));
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0)
            return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
        return `${m}m ${String(s).padStart(2, '0')}s`;
    }

    _fmtShort(sec) {
        sec = Math.max(0, Math.floor(sec));
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
        if (m === 0) return '<1m';
        return `${m}m`;
    }

    // ── Update display ───────────────────────────────────────────

    _update() {
        const s = this._getStatus();

        if (s.status === 'before') {
            this._setPanel('c2x-inactive', '\u25c7', `2\u00d7 soon`, 'muted');
            this._headerLabel.text = '\u25c7  PROMO STARTS SOON';
            this._headerLabel.style_class = 'c2x-header c2x-header-muted';
            this._subheaderLabel.text = 'Double hours begin March 13';
            this._subheaderLabel.style_class = 'c2x-subheader c2x-sub-muted';
            this._countdownKeyLabel.text = 'Starts in';
            this._countdownValLabel.text = this._fmtCountdown(s.secondsLeft);
            this._countdownValLabel.style_class = 'c2x-value';
            this._setProgress(0, false);
            this._percentLabel.text = '';
            this._nextValue.text = 'Mar 13, 2026';
            this._localValue.text = '\u2014';
            this._promoValue.text = 'Mar 27, 2026';
            return true;
        }

        if (s.status === 'after') {
            this._setPanel('c2x-ended', '\u25c7', '2\u00d7 ended', 'dim');
            this._headerLabel.text = '\u25c7  PROMO ENDED';
            this._headerLabel.style_class = 'c2x-header c2x-header-muted';
            this._subheaderLabel.text = 'The double hours promotion has ended';
            this._subheaderLabel.style_class = 'c2x-subheader c2x-sub-muted';
            this._countdownKeyLabel.text = '';
            this._countdownValLabel.text = '';
            this._setProgress(1, false);
            this._percentLabel.text = '';
            this._nextValue.text = '\u2014';
            this._localValue.text = '\u2014';
            this._promoValue.text = 'Ended';
            return false;
        }

        if (s.isDouble) {
            this._setPanel('c2x-active', '\u2726', `2\u00d7 \u00b7 ${this._fmtShort(s.remainingSec)}`, 'gold');
            this._headerLabel.text = '\u2726  DOUBLE HOURS ACTIVE  \u2726';
            this._headerLabel.style_class = 'c2x-header c2x-header-gold';
            this._subheaderLabel.text = '2\u00d7 tokens & messages';
            this._subheaderLabel.style_class = 'c2x-subheader c2x-sub-gold';
            this._countdownKeyLabel.text = 'Remaining';
            this._countdownValLabel.text = this._fmtCountdown(s.remainingSec);
            this._countdownValLabel.style_class = 'c2x-value c2x-value-gold';
            this._setProgress(s.progress, true);
            this._percentLabel.text = `${Math.round(s.progress * 100)}%`;
            this._percentLabel.style_class = 'c2x-percent c2x-percent-gold';
        } else {
            this._setPanel('c2x-inactive', '\u25c7', `2\u00d7 in ${this._fmtShort(s.remainingSec)}`, 'muted');
            this._headerLabel.text = '\u25c7  PEAK HOURS';
            this._headerLabel.style_class = 'c2x-header c2x-header-muted';
            this._subheaderLabel.text = 'Standard limits apply';
            this._subheaderLabel.style_class = 'c2x-subheader c2x-sub-muted';
            this._countdownKeyLabel.text = '2\u00d7 starts in';
            this._countdownValLabel.text = this._fmtCountdown(s.remainingSec);
            this._countdownValLabel.style_class = 'c2x-value';
            this._setProgress(s.progress, false);
            this._percentLabel.text = `${Math.round(s.progress * 100)}%`;
            this._percentLabel.style_class = 'c2x-percent';
        }

        // Common info
        this._nextValue.text = `${s.etTimeStr} ET`;
        this._localValue.text = s.localTimeStr;
        this._promoValue.text = `Mar 27  (${s.daysLeft}d left)`;
        return true;
    }

    _setPanel(boxClass, icon, text, mode) {
        // mode: 'gold', 'muted', 'dim'
        this._panelBox.style_class = `c2x-panel-box ${boxClass}`;
        this._iconLabel.text = icon;
        this._iconLabel.style_class = `c2x-icon c2x-icon-${mode}`;
        this._textLabel.text = text;
        this._textLabel.style_class = `c2x-text c2x-text-${mode}`;

        if (mode === 'gold') this._startPulse();
        else                 this._stopPulse();
    }

    _setProgress(fraction, gold) {
        const width = this._progressTrack.get_width();
        const w = width > 0 ? width : 230;
        this._progressFill.set_width(Math.max(1, Math.round(w * fraction)));
        this._progressFill.style_class = gold ? 'c2x-progress-fill c2x-fill-gold' : 'c2x-progress-fill c2x-fill-muted';
    }

    // ── Animations ───────────────────────────────────────────────

    _startPulse() {
        if (this._pulseActive) return;
        this._pulseActive = true;
        this._doPulse();
    }

    _doPulse() {
        if (!this._pulseActive || this._cleanedUp) return;
        this._iconLabel.ease({
            opacity: 130,
            duration: 2000,
            mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
            onComplete: () => {
                if (!this._pulseActive || this._cleanedUp) return;
                this._iconLabel.ease({
                    opacity: 255,
                    duration: 2000,
                    mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                    onComplete: () => {
                        if (!this._pulseActive || this._cleanedUp) return;
                        this._pulseIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                            this._pulseIdleId = null;
                            if (!this._pulseActive || this._cleanedUp)
                                return GLib.SOURCE_REMOVE;
                            this._doPulse();
                            return GLib.SOURCE_REMOVE;
                        });
                    },
                });
            },
        });
    }

    _stopPulse() {
        this._pulseActive = false;
        if (this._pulseIdleId) {
            GLib.Source.remove(this._pulseIdleId);
            this._pulseIdleId = null;
        }
        if (this._iconLabel && !this._cleanedUp) {
            this._iconLabel.remove_all_transitions();
            this._iconLabel.opacity = 255;
        }
        // remove_all_transitions fires onComplete synchronously — if a
        // callback slipped past the guard and added a new idle, clean it up
        if (this._pulseIdleId) {
            GLib.Source.remove(this._pulseIdleId);
            this._pulseIdleId = null;
        }
    }

    // ── Timer ────────────────────────────────────────────────────

    _startTimer() {
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            if (this._cleanedUp) {
                this._timerId = null;
                return GLib.SOURCE_REMOVE;
            }
            const keepRunning = this._update();
            if (!keepRunning) {
                this._timerId = null;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    // Called from disable() BEFORE destroy(). NOT a GObject vfunc,
    // so it cannot be invoked by GC during the sweep phase.
    _cleanup() {
        if (this._cleanedUp) return;
        this._cleanedUp = true;
        this._stopPulse();
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = null;
        }
        this._iconLabel = null;
        this._textLabel = null;
        this._panelBox = null;
    }
});

export default class Claude2xExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new Claude2xIndicator(this);

        const pos = this._settings.get_string('panel-position');
        Main.panel.addToStatusArea(this.metadata.uuid, this._indicator, 0, pos);

        this._posChangedId = this._settings.connect('changed::panel-position', () => {
            this._moveIndicator();
        });
    }

    disable() {
        if (this._posChangedId) {
            this._settings.disconnect(this._posChangedId);
            this._posChangedId = null;
        }
        if (this._indicator) {
            this._indicator._cleanup();
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }

    _moveIndicator() {
        if (!this._indicator) return;
        const pos = this._settings.get_string('panel-position');
        const container = this._indicator.container;
        const parent = container.get_parent();
        if (parent) parent.remove_child(container);

        const boxes = {
            left: Main.panel._leftBox,
            center: Main.panel._centerBox,
            right: Main.panel._rightBox,
        };
        const box = boxes[pos] || boxes.right;
        box.insert_child_at_index(container, 0);
    }
}
