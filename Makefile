build:
	anchor build
	rm -rf tests/fixtures
	mkdir -p tests/fixtures
	cp target/deploy/*.so tests/fixtures/
