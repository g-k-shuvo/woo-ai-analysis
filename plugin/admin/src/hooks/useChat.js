import { useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { ajaxUrl, nonce } = window.waaData || {};

/**
 * Chat message shape:
 * {
 *   id: string,
 *   role: 'user' | 'assistant' | 'error',
 *   content: string,
 *   timestamp: number,
 *   data: object|null (backend response data for assistant messages)
 * }
 */

let messageId = 0;
function nextId() {
	return `msg-${ ++messageId }`;
}

export default function useChat() {
	const [ messages, setMessages ] = useState( [] );
	const [ loading, setLoading ] = useState( false );

	const sendMessage = useCallback(
		async ( question ) => {
			if ( ! question || ! question.trim() ) {
				return;
			}

			const trimmed = question.trim();

			// Add user message
			const userMessage = {
				id: nextId(),
				role: 'user',
				content: trimmed,
				timestamp: Date.now(),
				data: null,
			};

			setMessages( ( prev ) => [ ...prev, userMessage ] );
			setLoading( true );

			const formData = new FormData();
			formData.append( 'action', 'waa_chat_query' );
			formData.append( 'nonce', nonce );
			formData.append( 'question', trimmed );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( result.success && result.data ) {
					const assistantMessage = {
						id: nextId(),
						role: 'assistant',
						content: result.data.answer || '',
						timestamp: Date.now(),
						data: result.data,
					};
					setMessages( ( prev ) => [ ...prev, assistantMessage ] );
				} else {
					const errorMsg =
						result.data?.message ||
						__( 'Something went wrong.', 'woo-ai-analytics' );
					const errorMessage = {
						id: nextId(),
						role: 'error',
						content: errorMsg,
						timestamp: Date.now(),
						data: null,
					};
					setMessages( ( prev ) => [ ...prev, errorMessage ] );
				}
			} catch {
				const errorMessage = {
					id: nextId(),
					role: 'error',
					content: __(
						'Network error. Please try again.',
						'woo-ai-analytics'
					),
					timestamp: Date.now(),
					data: null,
				};
				setMessages( ( prev ) => [ ...prev, errorMessage ] );
			} finally {
				setLoading( false );
			}
		},
		[]
	);

	const clearMessages = useCallback( () => {
		setMessages( [] );
	}, [] );

	return { messages, loading, sendMessage, clearMessages };
}
