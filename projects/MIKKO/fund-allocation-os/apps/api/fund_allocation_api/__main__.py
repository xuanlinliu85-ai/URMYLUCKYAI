import argparse

import uvicorn

from .database import SessionLocal, create_schema
from .skill_adapter.service import sync_registry


def main() -> None:
    parser = argparse.ArgumentParser(description="Fund Allocation OS API")
    parser.add_argument("command", choices=["init-db", "sync-skills", "serve"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    args = parser.parse_args()

    if args.command == "init-db":
        create_schema()
        print("Database schema initialized.")
        return
    if args.command == "sync-skills":
        with SessionLocal.begin() as session:
            count = sync_registry(session)
        print(f"Skill registry synchronized: {count} definitions.")
        return
    uvicorn.run("fund_allocation_api.main:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
