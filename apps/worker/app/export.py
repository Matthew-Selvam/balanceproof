import csv
import io


def to_csv(transactions):
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["Date", "Description", "Amount", "Balance", "Flags"])
    for t in transactions:
        writer.writerow(
            [
                t.get("date", ""),
                t.get("description", ""),
                "{:.2f}".format(t.get("amount") or 0.0),
                "" if t.get("balance") is None else "{:.2f}".format(t["balance"]),
                ";".join(t.get("flags") or []),
            ]
        )
    return buffer.getvalue()
