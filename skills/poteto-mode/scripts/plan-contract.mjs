export function hasResolvedLiveLane(text) {
	return /Ten lanes on `[^`<>]+` at the PR head/.test(text);
}

export function hasChangeOnlyTick(text) {
	return /only when the audit found a tracked change/.test(text)
		&& /If the audit found none, end the turn with no reply text\./.test(text);
}
