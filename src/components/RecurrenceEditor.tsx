import { allMonths, householdDate, recurrenceLabel, type Recurrence } from '../domain/recurrence';
const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Maj',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dec',
];
const fullMonthNames = [
  'januar',
  'februar',
  'marts',
  'april',
  'maj',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'december',
];

function daysInMonth(month: number) {
  return new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

function monthDayLabel(value: string) {
  return `${Number(value.slice(3))}. ${fullMonthNames[Number(value.slice(0, 2)) - 1]}`;
}

function MonthDayInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(3));
  const change = (nextMonth: number, nextDay: number) =>
    onChange(
      `${String(nextMonth).padStart(2, '0')}-${String(Math.min(nextDay, daysInMonth(nextMonth))).padStart(2, '0')}`,
    );
  return (
    <fieldset className="month-day">
      <legend>{label}</legend>
      <div className="month-day-grid">
        <label>
          Måned
          <select
            aria-label={`${label}, måned`}
            value={month}
            onChange={(event) => change(Number(event.target.value), day)}
          >
            {fullMonthNames.map((name, index) => (
              <option key={name} value={index + 1}>
                {name[0].toUpperCase() + name.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dag
          <select
            aria-label={`${label}, dag`}
            value={day}
            onChange={(event) => change(month, Number(event.target.value))}
          >
            {Array.from({ length: daysInMonth(month) }, (_, index) => index + 1).map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

export function RecurrenceEditor({
  value,
  onChange,
}: {
  value?: Recurrence | null;
  onChange: (v: Recurrence | null) => void;
}) {
  const anchor = value?.anchor ?? householdDate();
  return (
    <fieldset className="recurrence-editor">
      <legend>Gentagelse</legend>
      <label>
        Gentag opgaven
        <select
          value={value?.kind ?? 'none'}
          onChange={(e) => {
            const kind = e.target.value;
            onChange(
              kind === 'none'
                ? null
                : kind === 'season'
                  ? { kind, anchor, periods: [{ start: '06-01', end: '06-30' }] }
                  : kind === 'weekdays'
                    ? { kind, anchor, every: 1, days: [1], months: allMonths }
                    : {
                        kind: 'interval',
                        anchor,
                        every: 1,
                        unit: 'week',
                        mode: 'calendar',
                        months: allMonths,
                      },
            );
          }}
        >
          <option value="none">Ingen gentagelse</option>
          <option value="interval">Med fast interval</option>
          <option value="weekdays">Bestemte ugedage</option>
          <option value="season">Årlige sæsonperioder</option>
        </select>
      </label>
      {value && (
        <>
          <label>
            Gentagelse fra
            <input
              type="date"
              required
              value={anchor}
              onChange={(e) => onChange({ ...value, anchor: e.target.value })}
            />
          </label>
          {value.kind === 'interval' && (
            <>
              <label>
                Beregn næste gang
                <select
                  value={value.mode}
                  onChange={(e) =>
                    onChange({ ...value, mode: e.target.value as 'calendar' | 'completion' })
                  }
                >
                  <option value="calendar">Efter fast kalender</option>
                  <option value="completion">Efter seneste udførelse</option>
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Hver
                  <input
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={value.every}
                    onChange={(e) => onChange({ ...value, every: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Enhed
                  <select
                    value={value.unit}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        unit: e.target.value as 'day' | 'week' | 'month' | 'year',
                      })
                    }
                  >
                    <option value="day">dag</option>
                    <option value="week">uge</option>
                    <option value="month">måned</option>
                    <option value="year">år</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {value.kind === 'weekdays' && (
            <>
              <label>
                Hver (antal uger)
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={value.every}
                  onChange={(e) => onChange({ ...value, every: Number(e.target.value) })}
                />
              </label>
              <div className="recurrence-options">
                {['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map((name, i) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={value.days.includes(i + 1)}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          days: e.target.checked
                            ? [...value.days, i + 1]
                            : value.days.filter((d) => d !== i + 1),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </>
          )}
          {value.kind !== 'season' && (
            <details>
              <summary>Aktive måneder</summary>
              <div className="recurrence-options">
                {monthNames.map((name, i) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={value.months.includes(i + 1)}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          months: e.target.checked
                            ? [...value.months, i + 1]
                            : value.months.filter((m) => m !== i + 1),
                        })
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </details>
          )}
          {value.kind === 'season' && (
            <>
              {value.periods.map((p, i) => (
                <div key={i} className="season-period">
                  <MonthDayInput
                    label={`Periode ${i + 1} starter`}
                    value={p.start}
                    onChange={(start) =>
                      onChange({
                        ...value,
                        periods: value.periods.map((period, index) =>
                          index === i ? { ...period, start } : period,
                        ),
                      })
                    }
                  />
                  <MonthDayInput
                    label={`Periode ${i + 1} slutter`}
                    value={p.end}
                    onChange={(end) =>
                      onChange({
                        ...value,
                        periods: value.periods.map((period, index) =>
                          index === i ? { ...period, end } : period,
                        ),
                      })
                    }
                  />
                  <p className="season-summary">
                    Gælder hvert år: {monthDayLabel(p.start)} – {monthDayLabel(p.end)}
                    {p.end < p.start ? ' (går over nytår)' : ''}
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    disabled={value.periods.length === 1}
                    onClick={() =>
                      onChange({ ...value, periods: value.periods.filter((_, j) => j !== i) })
                    }
                  >
                    Fjern periode {i + 1}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                disabled={value.periods.length >= 12}
                onClick={() =>
                  onChange({
                    ...value,
                    periods: [...value.periods, { start: '09-01', end: '09-30' }],
                  })
                }
              >
                Tilføj sæsonperiode
              </button>
              <p className="muted small">
                Perioderne gentages hvert år. En slutdato før startdatoen går ind i næste år.
              </p>
            </>
          )}
          <p className="muted small">
            {recurrenceLabel(value)}. En forsinket opgave bliver stående. Ændringer påvirker næste
            forekomst; arbejde, der er startet, og tidligere udførelser bevares.
          </p>
        </>
      )}
    </fieldset>
  );
}
