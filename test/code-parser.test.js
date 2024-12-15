"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const chai_1 = require("chai");
const code_parser_1 = require("../src/code-parser");
describe('code-parser', () => {
    xdescribe('getVars', () => {
        it('hashes variables', () => {
            (0, chai_1.expect)((0, code_parser_1.getVars)('let a = 1;')).to.deep.eq({ a1: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('const a = 1;')).to.deep.eq({ a1: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('const a = 1; const b = 1;')).to.deep.eq({ a1: 1, a2: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('const a = 1;\nconst b = 1;')).to.deep.eq({ a1: 1, a2: 1 });
            // illegal but lets handle it
            (0, chai_1.expect)((0, code_parser_1.getVars)('const a = 1;const a = 1;')).to.deep.eq({ a1: 1, a2: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('const a = 1;\nconst a = 1;')).to.deep.eq({ a1: 1, a2: 1 });
        });
        it('hashes simple method calls', () => {
            (0, chai_1.expect)((0, code_parser_1.getVars)('m(1);')).to.deep.eq({ a1: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('m(1, 1);')).to.deep.eq({ a1: 1, a1_1: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('m(1,\n1);')).to.deep.eq({ a1: 1, a1_1: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('m(1,\n\t\t1);')).to.deep.eq({ a1: 1, a1_1: 1 });
        });
        it('hashes nested method calls', () => {
            (0, chai_1.expect)((0, code_parser_1.getVars)('m(1, m2(1));')).to.deep.eq({ a1: 1, a1_1: 1 });
            (0, chai_1.expect)((0, code_parser_1.getVars)('m(1, m(1));')).to.deep.eq({ a1: 1, a1_1: 1 });
        });
    });
    describe('codeHasChanged', () => {
        it('detects if the code has changed', () => {
            (0, code_parser_1.parseCode)(`
        let a = 1;
      `);
            (0, chai_1.expect)((0, code_parser_1.codeHasChanged)(`
        let a = 1;
      `)).to.be.false;
            (0, code_parser_1.parseCode)(`
        let a = 1;
      `);
            (0, chai_1.expect)((0, code_parser_1.codeHasChanged)(`
        let b = 1;
      `)).to.be.true;
            (0, code_parser_1.parseCode)(`
        console.log('a');
        `);
            (0, chai_1.expect)((0, code_parser_1.codeHasChanged)(`
        console.log('a', 'b');
      `)).to.be.true;
        });
        it('ignores formatting changes', () => {
            (0, code_parser_1.parseCode)(`
        let a = 1;
        console.log(a);
      `);
            (0, chai_1.expect)((0, code_parser_1.codeHasChanged)(`
        let a = 1;

             console.log(a);
      `)).to.be.false;
        });
        it('ignores literal value changes', () => {
            (0, code_parser_1.parseCode)(`
        let a = 1;
        console.log('a');
        `);
            (0, chai_1.expect)((0, code_parser_1.codeHasChanged)(`
        let a = 11;
        console.log('b');
      `)).to.be.false;
        });
    });
});
//# sourceMappingURL=code-parser.test.js.map