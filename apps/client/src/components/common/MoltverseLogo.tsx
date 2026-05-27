interface MoltverseLogoProps {
    className?: string;
    size?: number;
    showWordmark?: boolean;
}

/**
 * MoltverseLogo — official brand mark.
 *
 * The canonical Moltverse mascot: a small round-bodied creature with a soft
 * rounded hood silhouette, navy-indigo body, cream face panel with two simple
 * oval eyes. Renders from the master PNG asset at public/mascot-icon-1024.png
 * which downscales cleanly to favicon sizes.
 *
 * When showWordmark is true, the mascot is paired with the "moltverse"
 * wordmark in Fredoka Medium, split-color (molt indigo, verse lavender).
 */
export function MoltverseLogo({ className = '', size = 32, showWordmark = false }: MoltverseLogoProps) {
    const mascot = (
        <img
            src="/mascot-icon-1024.png"
            alt="Moltverse"
            width={size}
            height={size}
            style={{ display: 'block' }}
        />
    );

    if (!showWordmark) {
        return <span className={className}>{mascot}</span>;
    }

    const fontSize = Math.round(size * 0.7);
    return (
        <span
            className={`${className} inline-flex items-center font-display`}
            style={{
                gap: Math.round(size * 0.3),
                fontSize,
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1,
            }}
        >
            {mascot}
            <span>
                <span className="text-moltverse-navy dark:text-white">molt</span>
                <span className="text-moltverse-indigo dark:text-moltverse-indigo-light">verse</span>
            </span>
        </span>
    );
}
