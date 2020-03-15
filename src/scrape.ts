import * as fs from 'fs';
import * as path from 'path';
import _, { Collection } from 'lodash';
import moment from 'moment';

const input = path.join(__dirname, '..', '..', 'csse_covid_19_daily_reports');
const output = path.join(__dirname, '..', 'results', 'out.json');

const parse_csv_line = (line: string): string[] => {
	type ParseState = {
		out: string[];
		quote: boolean;
		current: string;
		prev: string;
	};
	const state = _(line)
		.split('')
		.reduce<ParseState>((state, ch) =>
			ch === '"' ?
				{
					...state,
					quote: !state.quote,
					current: !state.quote && state.prev === '"' ? state.current + '"' : state.current,
				}
			: (ch === ',' && !state.quote) ?
				{
					...state,
					current: '',
					out: [...state.out, state.current],
				}
			:
				{
					...state,
					current: state.current + ch,
				}
		, { out: [], quote: false, current: '', prev: '' });
	if (state.quote) {
		throw new Error(`Unterminated quote in CSV line: ${line}`);
	}
	state.out.push(state.current);
	return state.out;
};

interface Datum {
	region: string;
	country: string;
	date: string;
	cases: number;
	deaths: number;
	recovered: number;
	active: number;
	ratio: number;
}

type Data = Datum[];

const zero: Datum = {
	region: '',
	country: '',
	date: '',
	cases: 0,
	deaths: 0,
	recovered: 0,
	active: 0,
	ratio: 0,
};

const files = fs.readdirSync(input)
	.filter(x => /\.csv$/i.test(x))
	.map(x => path.join(input, x))
	;

const calc_ratio = (recovered: number, deaths: number) => (recovered + deaths) ? recovered / (recovered + deaths) : 0;

const parse_date = (date: string): string => moment(date, ['YYYY-MM-DDTHH:mm:ss', 'M/D/YYYY H:mm']).format('YYYY-MM-DD');

const data: Collection<Datum> = _(files)
	.map(name => _(fs.readFileSync(name, 'utf-8'))
		.split(/[\r\n]+/)
		.tap(lines => lines.shift())
		.map(line => line.replace(/^\s+|\s+$/g, ''))
		.filter(line => line.length > 0)
		.map((line, index) => {
			const [region, country, date, cases, deaths, recovered] = parse_csv_line(line);
			return <Datum> {
				region,
				country,
				date: parse_date(date),
				cases: +cases,
				deaths: +deaths,
				recovered: +recovered,
				active: +cases - +deaths - +recovered,
				ratio: calc_ratio(+recovered, +deaths),
			};
		})
		.sortBy('date')
		.value()
	)
	.flatten()
	.uniqBy(JSON.stringify)
	;

type RegionAg = {
	[country: string]: {
		[region: string]: Data;
	};
};

const by_region: RegionAg = data
	.groupBy('country')
	.mapValues(x => _.groupBy(x, 'region'))
	.value();

type DateAg = { [date: string]: Datum };

type CountryAg = {
	[country: string]: {
		[date: string]: Data;
	};
};

const by_country = data
	.groupBy('country')
	.mapValues(country_data => _(country_data.reduce<DateAg>(
		(xs: DateAg, x: Datum): DateAg => {
			const ag = xs[x.date] || zero;
			xs[x.date] = <Datum> {
				...ag,
				...x,
				region: '',
				cases: ag.cases + x.cases,
				deaths: ag.deaths + x.deaths,
				recovered: ag.recovered + x.recovered,
				active: ag.active + x.active,
				ratio: 0,
			};
			return xs;
		}, <DateAg> {}))
		.mapValues(ag => {
			ag.ratio = calc_ratio(ag.recovered, ag.deaths);
			return ag;
		})
		.value()
	)
	.value();

const country_latest: { [country: string]: Datum } = _(by_country)
	.mapValues(xs => _(xs)
			.sortBy('date')
			.reverse()
			.value()[0]
	)
	.value();

const result = {
	by_region,
	by_country,
	country_latest,
};

fs.writeFileSync(output, JSON.stringify(result, null, '\t'), 'utf-8');
