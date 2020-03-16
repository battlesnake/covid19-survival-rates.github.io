import * as d3 from 'd3';
import * as d3_time from 'd3-time';
import * as d3_color from 'd3-color';
import * as _ from 'lodash';
import { ScrapeData } from './types';

const margin = { left: 200, top: 200, right: 200, bottom: 20 };
const width_outer = 1200;
const height_outer = 1200;

const svg_root = d3.select('main')
	.append('svg')
		.attr('preserveAspectRatio', 'xMinYMin meet')
		.attr('viewBox', `0 0 ${width_outer} ${height_outer}`);
const svg = svg_root.append('g')
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
	/* Title */
	const title_area = svg.append('g')
		.attr('transform', `translate(0, ${-margin.top})`)
		.append('g')
			.attr('class', 'title-area');
	title_area.append('text')
		.attr('class', 'title')
		.text('2019-nCOV per-country surival rates');
	title_area.append('text')
		.attr('class', 'smallprint')
		.text('rates = survived / (survived + died).  Showing only countries with: more than 10 closed cases, and more than zero closed cases reported on at least five days');
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
	/* Colour scheme and legend */
	const country_colour = d3.scaleSequential(d3.interpolateRdYlBu)
		.domain([0, 1]);
	const legend_scale = d3.scaleLinear()
		.domain([0, 1])
		.range([margin.left - 20]);
	const legend_width = margin.left - 100;
	const legend_height = 20;
	svg_root
		.append('defs')
			.append('linearGradient')
				.attr('id', 'legend-gradient')
				.attr('width', margin.left - 20)
				.attr('height', 20)
				.attr('x1', '0%')
				.attr('x2', '100%')
				.attr('y1', '0%')
				.attr('y2', '0%')
				.selectAll('stop')
					.data([0, 20, 40, 60, 80, 100].map(x => ({ offset: `${x}%`, color: country_colour(x / 100) })))
					.enter()
						.append('stop')
						.attr('offset', d => d.offset)
						.attr('stop-color', d => d.color);
	const legend_area = svg_root
		.append('g')
			.attr('class', 'legend');
	legend_area.append('rect')
				.attr('width', legend_width)
				.attr('height', legend_height)
				.attr('fill', 'url(\'#legend-gradient\')');
	const x_legend = d3.scaleLinear()
		.domain([0, 1])
		.range([0, legend_width]);
	legend_area
		.append('g')
			.attr('transform', `translate(0, ${legend_height})`)
			.append('g')
				.attr('class', 'legend-axis')
				.call(d3.axisBottom(x_legend)
				.tickSize(5)
				.ticks(3)
				.tickFormat(d3.format('.0%')))
				.select('.domain').remove();
	legend_area
		.append('text')
			.attr('class', 'legend-title')
			.attr('dy', '-5')
			.text('Survival rate');
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
	const tooltip = svg_root
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
