//not worked... moved into utils.

// interface String {
//   format(...params: string[]): string;
// }

// if (!String.prototype.format) {
//   // First, checks if it isn't implemented yet.
//   String.prototype.format = function (...params: string[]) {
//     const args = params; //arguments;
//     return this.replace(/{(\d+)}/g, function (match, number) {
//       return typeof args[number] != 'undefined' ? args[number] : match;
//     });
//   };
// }
