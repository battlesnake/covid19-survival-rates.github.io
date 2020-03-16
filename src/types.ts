
export interface Datum {
	region: string;
	country: string;
	date: string;
	cases: number;
	deaths: number;
	recovered: number;
	active: number;
	ratio: number;
}

export type Data = Datum[];

export type RegionAg = {
	[country: string]: {
		[region: string]: Data;
	};
};

export type DateAg = { [date: string]: Datum };

export type CountryAg = {
	[country: string]: DateAg;
}

export type CountryLatest = { [country: string]: Datum };

export type ScrapeData = {
	data: Data;
	by_region: RegionAg;
	by_country: CountryAg;
	country_latest: CountryLatest;
}
