import * as d3 from 'd3';
import * as d3_time from 'd3-time';
import * as d3_color from 'd3-color';
import * as _ from 'lodash';
import { ScrapeData } from './types';

const margin = { left: 200, top: 200, right: 200, bottom: 20 };
const width_outer = 1200;
const height_outer = 1200;

const svg = d3.select('main')
	.append('svg')
		.attr('preserveAspectRatio', 'xMinYMin meet')
		.attr('viewBox', `0 0 ${width_outer} ${height_outer}`)
	.append('g')
		.attr('transform', `translate(${margin.left}, ${margin.top})`);

(async () => {
	const width = width_outer - margin.left - margin.right;
	const height = height_outer - margin.top - margin.bottom;
	const datasets = await d3.json<ScrapeData>("out.json");
	const countries: string[] = _(datasets.data).map('country').uniq().sort().value();
	const dates: Date[] = _(datasets.data).map('date').uniq().map(x => new Date(x)).value();
	const chart_data = _(datasets.by_country)
		.toPairs()
		.filter(([country, _]) => {
			const latest = datasets.country_latest[country];
			return latest.cases - latest.active > 10;
		})
		.map(([country, time_series]) => ({
			key: country,
			data: _(time_series)
				.filter(x => x.recovered + x.deaths > 0)
				.map(({ date, ratio }) => [new Date(date), ratio])
				.tap(xs => {
					xs.unshift([<Date> d3.min(xs, d => d[0]), 0]);
					xs.unshift([<Date> d3.min(dates), 0]);
					xs.push(xs[xs.length - 1]);
					xs.push([<Date> d3.max(xs, d => d[0]), 0]);
				})
				.value(),
		}))
		.filter(({ data }) => data.length >= 5)
		.sortBy('key')
		.value();
	const country_colour = d3.scaleSequential(d3.interpolateRdYlBu)
		.domain([0, 1]);
	/* Title */
	const title_area = svg.append('g')
		.attr('transform', `translate(0, ${-margin.top})`)
		.append('g')
			.attr('class', 'title-area');
	title_area.append('text')
		.attr('class', 'title')
		.text('2019-nCOV per-country surival ratios');
	title_area.append('text')
		.attr('class', 'smallprint')
		.text('ratio = survived / (survived + died).  Showing only countries with: more than 10 closed cases, and more than zero closed cases reported on at least five days');
	title_area.append('text')
		.attr('class', 'source')
		.html('Data source: <a href="https://github.com/CSSEGISandData/COVID-19">https://github.com/CSSEGISandData/COVID-19</a>');

	/* X-axis */
	const x_date = d3.scaleTime()
		.domain(<Date[]> d3.extent(dates))
		.range([0, width]);
	svg.append('g')
		.attr('class', 'x-axis')
		.call(d3.axisTop(x_date)
			.tickSize(-height)
			.tickFormat(<any> d3.timeFormat('%Y-%m-%d')))
		.select('.domain').remove();
	/* Y-axis, with spacing */
	const y_ratio = d3.scaleLinear()
		.domain([0, 1 * 1.2])
		.range([height / chart_data.length, 0]);
	const y_name = d3.scaleBand()
		.domain(_.map([...chart_data, ''], 'key'))
		.range([0, height])
		.paddingInner(1)
	/* Y-left axis */
	const y_axis = svg.append('g')
		.attr('class', 'y-axis')
		.call(d3.axisLeft(y_name)
			.tickSize(-width));
	y_axis.selectAll('.tick')
		.append('line')
		.attr('stroke', 'currentColor')
		.attr('x2', -margin.left / 2);
	y_axis.select('.domain')
		.remove();
	y_axis.selectAll('text')
		.attr('dx', -20)
		.attr('transform', `translate(0, ${height / 2 / chart_data.length})`)
	/* Y-right axis */
	const y_axis2 = svg.append('g')
		.attr('class', 'y-axis y-axis-2')
		.attr('transform', `translate(${width}, 0)`)
		.call(d3.axisRight(y_name)
			.tickSize(0));
	y_axis2.selectAll('.tick')
		.append('line')
		.attr('stroke', 'currentColor')
		.attr('x2', margin.left / 2);
	y_axis2.select('.domain')
		.remove();
	y_axis2.selectAll('text')
		.attr('dx', 20)
		.attr('transform', `translate(0, ${height / 2 / chart_data.length})`)
	/* Data plots */
	const areas = svg.selectAll('areas')
		.data(chart_data)
		.enter()
			.append('path')
			.attr('transform', d => `translate(0, ${y_name(d.key)})`)
			.attr('fill', d => {
				const country = d.key;
				const value = datasets.country_latest[country].ratio;
				return country_colour(value);
			})
			.attr('stroke', d => {
				const country = d.key;
				const value = datasets.country_latest[country].ratio;
				return (<any>d3_color.color(<string>country_colour(value))).darker().toString();
			})
			.attr('class', 'area-plot');
	areas
		.datum(d => d.data)
		.attr('d', <any> d3.line()
			.curve(d3.curveBasis)
			.x(d => x_date(d[0]))
			.y(d => y_ratio(d[1])));
	const tooltip = d3.select('main svg')
		.append('g')
		.attr('class', 'tooltip');
	const tooltip_g = tooltip
		.append('g')
		.attr('transform', 'translate(-40)');
	tooltip_g.append('circle')
			.attr('r', 20);
	tooltip_g
		.append('text');
	areas
		.on('mouseover', dd => {
			tooltip
				.classed('tooltip-show', true);
			const d = <[string, number][]> <any> dd;
			const value = d[d.length - 2];
			tooltip.select('text')
				.text(`${(<number> d[d.length - 2][1] * 100).toFixed(0)}%`);
		})
		.on('mousemove', d => {
			const CTM = <DOMMatrix> (d3.select('svg').node() as SVGSVGElement).getScreenCTM();
			const event = d3.event;
			const x = (event.clientX - CTM.e) / CTM.a;
			const y = (event.clientY - CTM.f) / CTM.d;
			tooltip
				.style('transform', `translate(${x}px, ${y}px)`);
		})
		.on('mouseout', d => {
			tooltip
				.classed('tooltip-show', false);
		});

})().catch(error => { document.body.innerHTML=`<h1>Error</h1><pre>${error.stack}</pre>`; });
