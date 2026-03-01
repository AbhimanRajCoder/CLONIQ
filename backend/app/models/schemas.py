from pydantic import BaseModel

class GitHubCompareRequest(BaseModel):
    repo_url_1: str
    repo_url_2: str

class GoogleSheetRequest(BaseModel):
    google_sheet_url: str
