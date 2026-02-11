import { useRef, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import useChat from '../hooks/useChat';
import ChatInput from './ChatInput';
import './ChatWindow.css';

const { connected } = window.waaData || {};

export default function ChatWindow() {
	const { messages, loading, sendMessage, clearMessages } = useChat();
	const messagesEndRef = useRef( null );

	// Auto-scroll to bottom when new messages arrive
	useEffect( () => {
		messagesEndRef.current?.scrollIntoView( { behavior: 'smooth' } );
	}, [ messages, loading ] );

	if ( ! connected ) {
		return (
			<div className="wrap">
				<h1>{ __( 'AI Analytics', 'woo-ai-analytics' ) }</h1>
				<div className="notice notice-warning">
					<p>
						{ __(
							'Please connect your store in Settings before using the chat.',
							'woo-ai-analytics'
						) }
					</p>
				</div>
			</div>
		);
	}

	const formatTime = ( timestamp ) => {
		const date = new Date( timestamp );
		return date.toLocaleTimeString( [], {
			hour: '2-digit',
			minute: '2-digit',
		} );
	};

	return (
		<div className="wrap">
			<div className="waa-chat">
				<div className="waa-chat__header">
					<h1>{ __( 'AI Analytics', 'woo-ai-analytics' ) }</h1>
					{ messages.length > 0 && (
						<button
							type="button"
							className="button button-link waa-chat__clear"
							onClick={ clearMessages }
						>
							{ __( 'Clear chat', 'woo-ai-analytics' ) }
						</button>
					) }
				</div>

				<div className="waa-chat__messages">
					{ messages.length === 0 && ! loading && (
						<div className="waa-chat__empty">
							<p>
								{ __(
									'Ask a question about your WooCommerce data.',
									'woo-ai-analytics'
								) }
							</p>
						</div>
					) }

					{ messages.map( ( msg ) => (
						<div
							key={ msg.id }
							className={ `waa-chat__message waa-chat__message--${ msg.role }` }
						>
							<div className="waa-chat__message-content">
								{ msg.content }
							</div>
							{ msg.data?.rowCount !== undefined &&
								msg.role === 'assistant' && (
									<div className="waa-chat__message-meta">
										{ msg.data.rowCount }{ ' ' }
										{ msg.data.rowCount === 1
											? __( 'row', 'woo-ai-analytics' )
											: __( 'rows', 'woo-ai-analytics' ) }
										{ ' · ' }
										{ msg.data.durationMs }
										{ __( 'ms', 'woo-ai-analytics' ) }
									</div>
								) }
							<div className="waa-chat__message-time">
								{ formatTime( msg.timestamp ) }
							</div>
						</div>
					) ) }

					{ loading && (
						<div className="waa-chat__message waa-chat__message--assistant waa-chat__message--loading">
							<div className="waa-chat__loading-dots">
								<span></span>
								<span></span>
								<span></span>
							</div>
						</div>
					) }

					<div ref={ messagesEndRef } />
				</div>

				<ChatInput
					onSend={ sendMessage }
					loading={ loading }
					showSuggestions={ messages.length === 0 && ! loading }
				/>
			</div>
		</div>
	);
}
