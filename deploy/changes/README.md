cd ~/localghost/web/deploy/changes
go build -o bin/apply-footer ./cmd/apply-footer
./bin/apply-footer -dry ../../public/ html/footer.html
./bin/apply-footer ../../public/ html/footer.html