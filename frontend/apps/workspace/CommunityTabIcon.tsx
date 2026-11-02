export function CommunityTabIcon({ tab }: { tab: string }) {
    return (
        <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {tab === 'pairings' ? (
                <>
                    <rect x="3" y="4" width="7" height="6" rx="1" />
                    <rect x="14" y="4" width="7" height="6" rx="1" />
                    <path d="M6.5 10v5h11v-5M12 15v5" />
                </>
            ) : tab === 'ranking' ? (
                <path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 13v6M8 21h8" />
            ) : tab === 'history' ? (
                <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                </>
            ) : (
                <>
                    <path d="M3 6h18M3 12h18M3 18h18" />
                    <circle cx="8" cy="6" r="2" />
                    <circle cx="16" cy="12" r="2" />
                    <circle cx="9" cy="18" r="2" />
                </>
            )}
        </svg>
    );
}
