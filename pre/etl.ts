import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import * as moment from 'moment';
import { Datum, Data, RegionAg, CountryAg, DateAg, CountryLatest, ScrapeData } from '../src/types';
import * as zlib from 'zlib';

if (process.argv.length !== 3) {
	throw new Error('Input path to csse_covid_19_daily_reports is required');
}

const input = process.argv[2];
const output = path.join(__dirname, '..', 'results', 'out.json.brotli');

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

type CsvLine = { [key: string]: string };

const parse_csv_file = (file: string[]): CsvLine[] => {
	if (file.length <= 1) {
		return [];
	}
	const keys = parse_csv_line(file[0])
		.map(s => s.replace(/[^\w]/g, '_'));
	return _(file)
		.slice(1)
		.map(line =>
			_(keys)
				.zip(parse_csv_line(line))
				.fromPairs()
				.value()
		)
		.value();
};

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

const country_name_map: { [name: string]: string } = {
	'Viet Nam': 'Vietnam',
	'UK': 'United Kingdom',
	'US': 'USA',
	'Taiwan*': 'Taiwan',
	'Republic of Korea': 'South Korea',
	'Russian Federation': 'Russia',
	'occupied Palestinian territory': 'Palestine',
	'North Ireland': 'United Kingdom',
	'Republic of Moldova': 'Moldova',
	'Republic of Ireland': 'Ireland',
	'Macau SAR': 'Macau',
	'Korea, South': 'South Korea',
	'Iran (Islamic Republic of)': 'Iran',
	'Hong Kong SAR': 'Hong Kong',
	'Cote d\'Ivoire': 'Ivory Coast',
	'Mainland China': 'China',
	'Cruise Ship': 'REJECT',
	'Others': 'REJECT',
};

const normalise_country = (name: string): string => name in country_name_map ? country_name_map[name] : name;

type RawDatum = Pick<Datum, 'region' | 'country' | 'date' | 'cases' | 'deaths' | 'recovered'>;

const data: Data = _(files)
	.map(name => parse_csv_file(
			fs.readFileSync(name, 'utf-8')
				.split(/[\r\n]+/)
				.map(s => s.replace(/^\s+|\s+$/g, ''))
				.filter(s => s.length > 0)))
	.flatten()
	.map<RawDatum>(entry => {
		const {
			Province_State: region,
			Country_Region: country,
			Last_Update: date,
			Confirmed: cases,
			Deaths: deaths,
			Recovered: recovered,
		} = entry;
		return <Datum> {
			region,
			country: normalise_country(country),
			date: parse_date(date),
			cases: +cases,
			deaths: +deaths,
			recovered: +recovered,
		};
	})
	.sortBy('date')
	.reject(x => x.country === 'REJECT')
	.uniqBy(JSON.stringify)
	.map<Datum>(x => ({
		...x,
		active: x.cases - x.deaths - x.recovered,
		ratio: calc_ratio(x.recovered, x.deaths),
	}))
	.value()
	;

const by_region: RegionAg = _(data)
	.groupBy('country')
	.mapValues(x => _.groupBy(x, 'region'))
	.value();

const by_country: CountryAg = _(data)
	.groupBy('country')
	.mapValues((country_data: Data): DateAg => _(_(country_data.reduce<DateAg>(
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
		.toPairs()
		.reduce<[string, Datum][]>((xs: [string, Datum][], x: [string, Datum]) =>
			xs.length === 0 || x[1].cases >= xs[xs.length - 1][1].cases ?
				[...xs, x]
			:
				[...xs]
		, []))
		.fromPairs()
		.value()
	)
	.value();

const country_latest: CountryLatest = _(by_country)
	.mapValues(xs => _(xs)
			.sortBy('date')
			.reverse()
			.value()[0]
	)
	.value();

const result: ScrapeData = {
	data,
	by_region,
	by_country,
	country_latest,
};

fs.writeFileSync(
	output,
	zlib.brotliCompressSync(
		Buffer.from(JSON.stringify(result), 'utf-8'),
		{
			params: {
				[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
				[zlib.constants.BROTLI_PARAM_QUALITY]: 9,
			}
		}));
