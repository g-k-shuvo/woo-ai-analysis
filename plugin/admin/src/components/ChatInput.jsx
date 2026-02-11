import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import './ChatInput.css';

const { ajaxUrl, nonce } = window.waaData || {};

const FALLBACK_SUGGESTIONS = [
	__( 'What was my total revenue this month?', 'woo-ai-analytics' ),
	__( 'What are my top 5 selling products?', 'woo-ai-analytics' ),
	__( 'How many new customers did I get this week?', 'woo-ai-analytics' ),
	__( 'What is my average order value?', 'woo-ai-analytics' ),
	__( 'Show revenue trend for the last 30 days', 'woo-ai-analytics' ),
	__( 'Which product categories perform best?', 'woo-ai-analytics' ),
];

export default function ChatInput( { onSend, loading, showSuggestions } ) {
	const [ inputValue, setInputValue ] = useState( '' );
	const [ suggestions, setSuggestions ] = useState( FALLBACK_SUGGESTIONS );
	const textareaRef = useRef( null );

	// Auto-focus textarea on mount
	useEffect( () => {
		textareaRef.current?.focus();
	}, [] );

	// Fetch suggestions from backend on mount
	useEffect( () => {
		if ( ! ajaxUrl || ! nonce ) {
			return;
		}

		const controller = new AbortController();
		const formData = new FormData();
		formData.append( 'action', 'waa_chat_suggestions' );
		formData.append( 'nonce', nonce );

		fetch( ajaxUrl, {
			method: 'POST',
			body: formData,
			signal: controller.signal,
		} )
			.then( ( response ) => response.json() )
			.then( ( result ) => {
				if ( result.success && result.data?.suggestions?.length > 0 ) {
					setSuggestions( result.data.suggestions );
				}
			} )
			.catch( () => {
				// Keep fallback suggestions on error or abort
			} );

		return () => controller.abort();
	}, [] );

	const handleSubmit = ( e ) => {
		e.preventDefault();
		if ( ! inputValue.trim() || loading ) {
			return;
		}
		onSend( inputValue );
		setInputValue( '' );
	};

	const handleKeyDown = ( e ) => {
		if ( e.key === 'Enter' && ! e.shiftKey ) {
			e.preventDefault();
			handleSubmit( e );
		}
	};

	const handleSuggestionClick = ( suggestion ) => {
		if ( loading ) {
			return;
		}
		onSend( suggestion );
	};

	return (
		<div className="waa-chat-input">
			{ showSuggestions && suggestions.length > 0 && (
				<div
					className="waa-chat-input__suggestions"
					role="group"
					aria-label={ __(
						'Suggested questions',
						'woo-ai-analytics'
					) }
				>
					<p className="waa-chat-input__suggestions-label">
						{ __( 'Suggested questions:', 'woo-ai-analytics' ) }
					</p>
					<div className="waa-chat-input__suggestions-list">
						{ suggestions.map( ( suggestion ) => (
							<button
								key={ suggestion }
								type="button"
								className="waa-chat-input__suggestion-chip"
								onClick={ () =>
									handleSuggestionClick( suggestion )
								}
								disabled={ loading }
							>
								{ suggestion }
							</button>
						) ) }
					</div>
				</div>
			) }

			<form className="waa-chat-input__form" onSubmit={ handleSubmit }>
				<textarea
					ref={ textareaRef }
					className="waa-chat-input__textarea"
					aria-label={ __(
						'Ask a question about your store data',
						'woo-ai-analytics'
					) }
					value={ inputValue }
					onChange={ ( e ) => setInputValue( e.target.value ) }
					onKeyDown={ handleKeyDown }
					placeholder={ __(
						'Ask a question about your store data\u2026',
						'woo-ai-analytics'
					) }
					disabled={ loading }
					rows={ 1 }
				/>
				<button
					type="submit"
					className="button button-primary waa-chat-input__send"
					disabled={ loading || ! inputValue.trim() }
				>
					{ loading
						? __( 'Thinking\u2026', 'woo-ai-analytics' )
						: __( 'Send', 'woo-ai-analytics' ) }
				</button>
			</form>
		</div>
	);
}

ChatInput.propTypes = {
	onSend: PropTypes.func.isRequired,
	loading: PropTypes.bool.isRequired,
	showSuggestions: PropTypes.bool.isRequired,
};
