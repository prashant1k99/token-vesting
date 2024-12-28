build:
	anchor build
	rm -f tests/fixtures/*.so
	cp target/deploy/*.so tests/fixtures/
	rm -f app/vesting_dapp*
	cp target/types/* app/
	cp target/idl/*.json app/
