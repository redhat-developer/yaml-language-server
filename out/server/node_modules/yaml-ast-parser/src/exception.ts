
import Mark=require("./mark")
'use strict';
class YAMLException {

  message:string
  reason:string
  name:string
  mark:Mark

  constructor(reason:string, mark:Mark=null) {
    this.name = 'YAMLException';
    this.reason = reason;
    this.mark = mark;
    this.message = this.toString(false);
  }

  toString(compact:boolean=false){
    var result;

    result = 'JS-YAML: ' + (this.reason || '(unknown reason)');

    if (!compact && this.mark) {
      result += ' ' + this.mark.toString();
    }

    return result;

  }
}
export=YAMLException