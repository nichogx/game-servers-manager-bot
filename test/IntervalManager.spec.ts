import { expect } from "chai";

import IntervalManager from "../src/IntervalManager";

describe("Tests for IntervalManager", () => {

	let interval: IntervalManager = null;

	let called: boolean = false;

	beforeEach(() => {
		interval = new IntervalManager(() => {
			called = true;
		}, 10);
	});

	afterEach(() => {
		interval.stop();
		called = false;
	});

	it("should be able to start the timer", () => {
		expect(interval.start()).to.equal(true);
	});

	it("should be able to stop the interval after starting it", () => {
		expect(interval.start()).to.equal(true);
		expect(interval.stop()).to.equal(false);
	});

	it("should return the active state", () => {
		expect(interval.active()).to.equal(false);
		expect(interval.start()).to.equal(true);
		expect(interval.active()).to.equal(true);
		expect(interval.stop()).to.equal(false);
		expect(interval.active()).to.equal(false);
	});

	it("the interval state should not be affected by starting a started timer", () => {
		expect(interval.start()).to.equal(true);
		expect(interval.start()).to.equal(true);
	});

	it("the interval state should not be affected by stopping a stopped timer", () => {
		expect(interval.stop()).to.equal(false);
	});

	it("should be able to reset a timer without providing an argument", () => {
		expect(interval.start()).to.equal(true);
		expect(interval.reset()).to.equal(true);
	});

	it("should be able to reset a stopped timer", () => {
		expect(interval.reset()).to.equal(true);
	});

	it("should be able to reset a timer with an argument", () => {
		expect(interval.reset(5)).to.equal(true);
	});

	it("should call the callback after time has passed, but not before", (done) => {
		expect(called).to.equal(false);
		expect(interval.reset(0.2)).to.equal(true);
		expect(called).to.equal(false);
		setTimeout(() => {
			expect(called).to.equal(true);
			done();
		}, 0.4 * 1000);
	});
});