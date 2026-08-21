import pandas as pd

df = pd.read_csv("../data/KaggleV2-May-2016.csv")
df.columns = df.columns.str.strip()

df["ScheduledDay"] = pd.to_datetime(df["ScheduledDay"])
df["AppointmentDay"] = pd.to_datetime(df["AppointmentDay"])
df["LeadDays"] = (df["AppointmentDay"] - df["ScheduledDay"]).dt.days
df["LeadDays"] = df["LeadDays"].clip(lower=0)

print(df.shape)
print(df["No-show"].value_counts(normalize=True))
print(df.groupby("No-show")["LeadDays"].describe())
print(df.groupby("No-show")["Age"].describe())
