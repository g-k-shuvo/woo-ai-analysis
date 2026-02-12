import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import './TableRenderer.css';

export default function TableRenderer( { config } ) {
	if ( ! config || ! config.headers || ! config.rows ) {
		return null;
	}

	return (
		<div className="waa-table">
			{ config.title && (
				<div className="waa-table__title">{ config.title }</div>
			) }
			<div className="waa-table__scroll">
				<table
					aria-label={
						config.title || __( 'Data table', 'woo-ai-analytics' )
					}
				>
					<thead>
						<tr>
							{ config.headers.map( ( header, index ) => (
								<th key={ index }>{ header }</th>
							) ) }
						</tr>
					</thead>
					<tbody>
						{ config.rows.length === 0 ? (
							<tr>
								<td colSpan={ config.headers.length }>
									{ __(
										'No data available.',
										'woo-ai-analytics'
									) }
								</td>
							</tr>
						) : (
							config.rows.map( ( row, rowIndex ) => (
								<tr key={ rowIndex }>
									{ row.map( ( cell, cellIndex ) => (
										<td key={ cellIndex }>
											{ String( cell ?? '' ) }
										</td>
									) ) }
								</tr>
							) )
						) }
					</tbody>
				</table>
			</div>
		</div>
	);
}

TableRenderer.propTypes = {
	config: PropTypes.shape( {
		type: PropTypes.oneOf( [ 'table' ] ).isRequired,
		title: PropTypes.string,
		headers: PropTypes.arrayOf( PropTypes.string ).isRequired,
		rows: PropTypes.arrayOf( PropTypes.array ).isRequired,
	} ).isRequired,
};
