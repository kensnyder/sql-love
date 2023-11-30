export default function substrCount(haystack: string, needle: string) {
	let count = 0;
	let pos = haystack.indexOf(needle);
	while (pos !== -1) {
		count += 1;
		pos = haystack.indexOf(needle, pos + 1);
	}
	return count;
}
